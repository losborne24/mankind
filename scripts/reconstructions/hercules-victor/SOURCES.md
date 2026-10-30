# Temple of Hercules Victor — source review (draft, 30 Oct 2026)

Working notes for the v1 exterior interpretation. Nothing is generated yet.
Every figure below must keep its source when it moves into `parameters.json`.

## Agreed figures (two independent secondary sources agree)

| Feature | Value | Sources | Confidence |
| --- | --- | --- | --- |
| Plan | Circular cella inside a ring colonnade (peripteral tholos) | Wikipedia; World History Encyclopedia | Documented (standing building) |
| Overall diameter | 14.8 m (≈ 50 Roman feet) | Wikipedia (citing Loar 2017); WHE | Documented |
| Columns | 20 Corinthian (19 survive) | Wikipedia (Loar 2017); WHE | Documented |
| Column height | 10.65–10.66 m (≈ 36 Roman feet) | Wikipedia (Loar 2017); WHE | Documented |
| Podium | Stepped tufa base, five steps all round | WHE (Wikipedia: "tuff foundation") | Documented (step count single-source) |
| Materials | Pentelic marble columns/cella; 10 north-side columns replaced in Luna marble, 1st c. AD | WHE | Documented |
| Date | Later 2nd c. BC (c. 143–132 BC dedication) | Wikipedia (Loar 2017) | Documented |

The AD 100 context fits: the 1st-century column replacements predate it, so all 20
columns stood. A material contrast on the 10 north columns is defensible but subtle.

## Not established (must be labelled inferred in the model)

- **Entablature and roof:** both lost. Today's tiled roof is later. Palladio drew a
  dome, now generally considered mistaken. v1 should use a simple low conical tiled
  roof over a plain entablature, labelled as inference. This is a strong
  "where the evidence ends" story beat in its own right.
- **Cella diameter, wall thickness, column diameter, intercolumniation:** no figure
  found yet. To be measured off a public-domain plan (below) or derived from the
  20-column ring at 14.8 m, and labelled inferred.
- **Door orientation and size:** not stated in sources so far. Check plan; otherwise
  an inferred display pose (as with Portunus).
- **Windows:** the two flanking windows visible today are 12th-century additions.
  Omit them at AD 100.
- **Upper cella wall:** the existing brick upper wall is medieval. Model full-height marble.

## Drawing source (resolved 30 Oct 2026)

**Palladio, *I quattro libri dell'architettura* (Venice: Domenico de' Franceschi, 1570),
Book IV ch. XIV, plan on p. 91** (Getty Research Institute copy, Internet Archive item
`qvattrolibridel00pall`, scan leaf n290, 342 leaves, scanned at Santa Monica).
Page: https://archive.org/details/qvattrolibridel00pall/ (leaf: `/page/n290`).

**Licence check:** the 1570 text and plate are public domain by age. The Internet Archive
item carries no rights, licence or possible-copyright-status field and no Public Domain
Mark; the only applicable terms are the Archive's general Terms of Service. A faithful
scan of a 2D public-domain work adds no new copyright in most jurisdictions, but the
holder states nothing, so: **measurements only, no pixels redistributed in the repo.**

**What Palladio gives (text, p. 90):** Corinthian; intercolumniation 1.5 diameters;
columns 11 diameters tall with base and capital; no plinth (the step serves); cella
outer diameter (walls included) equals column height; cornice not visible, so
Palladio-supplied; cella roof is a "tribuna" (dome). Windows and door "plain and well made".

**What the plan shows (measured off leaf n290, approximate pixels at 554 px wide):**
colonnade outer 510 px, cella outer 329 px, so cella/colonnade ratio is about 0.645;
wall thickness about 37 px (0.073 of colonnade); one flight of about 10 steps at the door only.
**Palladio draws only about 12 columns, not 20.** He is wrong or schematic, so the
ring count comes from the standing building, never from him.

**Text and plan disagree:** text gives cella outer = 10.65 m (column height), the plan
gives 0.645 x 14.8 = 9.55 m. The model uses the plan ratio and records the range.

Palladio's dimensions are Vicentine feet and his superstructure is interpretive, so use
him for plan ratios only.

RIBA holds Palladio's 1560 study drawing (SD166/VIII/1B recto), but no licence is
stated, so treat it as reference only, with no pixels used.

## Sources

- Palladio 1570, Getty/Internet Archive scan: https://archive.org/details/qvattrolibridel00pall/
- Temple of Hercules Victor, Wikipedia: https://en.wikipedia.org/wiki/Temple_of_Hercules_Victor
- Temple of Vesta/Hercules, World History Encyclopedia: https://www.worldhistory.org/article/625/temple-of-vestahercules-rome/
- Palladio study drawing, RIBApix: https://www.architecture.com/image-library/ribapix/image-information/poster/study-of-the-temple-of-vesta-by-the-tiber-plan-elevation-and-details-of-the-orders/posterid/RIBA125341.html
- Roma Capitale / Turismo Roma (location, to verify; page refused automated fetch): https://turismoroma.it/it/luoghi/tempio-di-ercole-vincitore
