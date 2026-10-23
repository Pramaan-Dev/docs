# Pramaan docs

Mintlify site for the Pramaan API. Configuration lives in `docs.json`; guide pages are MDX.

## API reference

The Superpowers, Missions and Platform API tabs are generated. Do not edit `specs/` or those
tabs in `docs.json` by hand. Rebuild them from the live API:

```bash
node scripts/build-api.mjs
```

It reads `https://api.pramaan.dev/openapi.json` and sorts each operation into the same
categories as www.pramaan.dev, using its public catalogue files. One spec file per category
keeps each page small; a single file made every page about 7 MB.

## Words

- "Superpower" for one action, "mission" for a multi-step job. The API paths say
  `capabilities` and `outcomes`; use those words only when quoting a path or field.
- Prices are in US dollars.

## Style

- Plain words, active voice, second person.
- Sentence case headings.
- Code formatting for ids, paths, headers and commands.
