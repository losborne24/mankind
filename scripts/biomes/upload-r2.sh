#!/usr/bin/env bash
# Publish a generated biome tile pyramid to Cloudflare R2.
#
# Dry run by default. Nothing is uploaded and no resource is created until you
# pass --confirm. This script never creates a bucket, token, domain or cache
# rule: provision those yourself first (see docs/global-biomes.md).
#
#   scripts/biomes/upload-r2.sh .biome-data/tiles/pnv-v4-global biomes/pnv-v4
#   scripts/biomes/upload-r2.sh .biome-data/tiles/pnv-v4-global biomes/pnv-v4 --confirm
#
# Requires: aws CLI, and an AWS profile whose credentials are a scoped R2
# object-write token. Credentials must never appear in NEXT_PUBLIC_* variables.
set -euo pipefail

SOURCE=${1:-}
PREFIX=${2:-}
CONFIRM=${3:-}
: "${R2_BUCKET:?Set R2_BUCKET to the target bucket name}"
: "${R2_ACCOUNT_ID:?Set R2_ACCOUNT_ID to your Cloudflare account id}"
PROFILE=${R2_PROFILE:-mankind-r2}
ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

if [[ -z $SOURCE || -z $PREFIX ]]; then
  echo "usage: $0 <tile-directory> <bucket-prefix> [--confirm]" >&2
  exit 64
fi
if [[ ! -f "$SOURCE/tilejson.json" ]]; then
  echo "No tilejson.json in $SOURCE — generate and validate tiles first." >&2
  exit 66
fi

if ! command -v aws >/dev/null; then
  echo "The aws CLI is not installed. R2 is S3-compatible and this script drives it through aws s3." >&2
  echo "Install it, then configure a profile holding a scoped R2 object-write token." >&2
  exit 69
fi

FORMAT=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["format"])' "$SOURCE/tilejson.json")
case $FORMAT in
  png) CONTENT_TYPE=image/png ;;
  webp) CONTENT_TYPE=image/webp ;;
  *) echo "Unexpected tile format: $FORMAT" >&2; exit 65 ;;
esac

DRY=(--dryrun)
if [[ $CONFIRM == --confirm ]]; then
  DRY=()
else
  echo "DRY RUN — re-run with --confirm to upload. No objects will be written."
fi

echo "Source      : $SOURCE ($FORMAT tiles)"
echo "Destination : s3://${R2_BUCKET}/${PREFIX}/"
echo "Endpoint    : $ENDPOINT (profile $PROFILE)"

sync() {
  # --size-only keeps retries and incremental runs cheap: R2 object timestamps
  # change on re-upload, and a tile's bytes fully determine its content.
  aws --profile "$PROFILE" --endpoint-url "$ENDPOINT" s3 sync "${DRY[@]}" --size-only --no-progress "$@"
}

# 1. Immutable, content-addressed-by-version tile pyramid. A palette or
#    processing change means a NEW prefix; objects here are never overwritten.
sync "$SOURCE/" "s3://${R2_BUCKET}/${PREFIX}/" \
  --exclude '*' --include "*.${FORMAT}" \
  --content-type "$CONTENT_TYPE" \
  --cache-control 'public,max-age=31536000,immutable'

# 2. Licence, provenance and the ODbL derivative-database access files. These
#    must stay publicly retrievable alongside the tiles (ODbL 4.4/4.6).
sync "$SOURCE/" "s3://${R2_BUCKET}/${PREFIX}/" \
  --exclude '*' --include 'NOTICE.txt' --include '*.csv' --include '*.md' \
  --include 'palette.json' --include 'surface.json' --include 'metadata.json' \
  --include 'build.py' --include 'materials.py' --include 'requirements.txt' \
  --include '*.geojson' --include 'classes.tif' \
  --cache-control 'public,max-age=86400'

# 3. The manifest last, so a partially uploaded pyramid is never advertised.
aws --profile "$PROFILE" --endpoint-url "$ENDPOINT" s3 cp "${DRY[@]}" \
  "$SOURCE/tilejson.json" "s3://${R2_BUCKET}/${PREFIX}/tilejson.json" \
  --content-type application/json --cache-control 'public,max-age=300'

echo
if [[ ${#DRY[@]} -eq 0 ]]; then
  echo "Upload complete. Verify before pointing the app at it:"
  echo "  curl -sI -H 'Origin: https://<APP_DOMAIN>' https://<TILE_DOMAIN>/${PREFIX}/tilejson.json"
  echo "  curl -sI -H 'Origin: https://<APP_DOMAIN>' https://<TILE_DOMAIN>/${PREFIX}/0/0/0.${FORMAT}"
  echo "Then build with NEXT_PUBLIC_BIOME_TILE_URL=https://<TILE_DOMAIN>/${PREFIX}"
else
  echo "Dry run finished. Review the planned operations above, then add --confirm."
fi
