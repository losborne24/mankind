"""Review sheet from actual Blender PNGs. Run with the project's Pillow environment."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[2]
variants=json.loads((root/'scripts/roman-kit/variations.json').read_text())['variants']
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',20)
small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
sheet=Image.new('RGB',(1920,1350),(32,35,32));draw=ImageDraw.Draw(sheet)
draw.text((25,16),'ROMAN PROVINCIAL BUILDINGS · 12 seeded designs · actual Blender renders',font=font,fill=(230,222,204))
for i,(name,entry) in enumerate(variants.items()):
    x=(i%4)*480;y=(i//4)*430+55
    image=Image.open(root/f'.biome-data/review/roman-kit/{name}-front.png').convert('RGB');image.thumbnail((475,385))
    sheet.paste(image,(x+(480-image.width)//2,y))
    draw.text((x+14,y+387),f'{i+1:02}  {name}',font=font,fill=(230,222,204))
    draw.text((x+14,y+411),f"{entry['profile']} · seed {entry['seed']}",font=small,fill=(170,175,162))
sheet.save(root/'docs/previews/roman-variants-overview.jpg',quality=91)
