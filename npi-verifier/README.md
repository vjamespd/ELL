# ELL NPI Verifier

Small Node service for real NPI validation against official CMS/NPPES sources.

## What it does

1. Validates that the submitted NPI is exactly 10 digits
2. Applies the NPI check-digit rule
3. Looks up the NPI against the official NPPES registry
4. Restricts access to approved provider taxonomy groups
5. Returns a normalized response the ELL theme can use

## Phase 1 eligibility rules

The current hosted verifier allows only NPIs whose NPPES taxonomy matches one of these provider groups:

- `MD/DO`
- `NP`
- `PA`
- `ND`
- `DDS/DMD`
- `DPM`

This is taxonomy-based filtering only. It does **not** yet verify state license standing such as `active`, `clear`, or `good standing`.

## Official reference sources

- CMS National Provider Identifier standard: https://www.cms.gov/regulations-and-guidance/administrative-simplification/nationalprovidentstand
- CMS NPPES data dissemination readme: https://www.cms.gov/Regulations-and-Guidance/Administrative-Simplification/NationalProvIdentStand/Downloads/Data_Dissemination_File-Readme.pdf
- NPPES Registry site: https://npiregistry.cms.hhs.gov/

## Run locally

```bash
cd /Users/vinard/Desktop/Sides/ELL/npi-verifier
cp .env.example .env
npm start
```

Default local endpoint:

```text
http://127.0.0.1:8787/verify
```

Health check:

```text
http://127.0.0.1:8787/health
```

## Example request

```bash
curl -X POST http://127.0.0.1:8787/verify \
  -H 'Content-Type: application/json' \
  -d '{"npi":"1234567893","context":"catalog"}'
```

## Environment variables

- `PORT`: service port, default `8787`
- `HOST`: bind host, use `127.0.0.1` locally or `0.0.0.0` in hosted environments
- `NPPES_API_URL`: official lookup base URL, default `https://npiregistry.cms.hhs.gov/api/`
- `ALLOWED_ORIGINS`: comma-separated allowed browser origins, default `*`

## Deploy on Render

This repo now includes a root-level `render.yaml` Blueprint for the verifier service.

1. Push this repo to GitHub.
2. In Render, create a new Blueprint from the repository.
3. When prompted for `ALLOWED_ORIGINS`, enter your live storefront domains, for example:

```text
https://ellstemcells.com,https://www.ellstemcells.com
```

4. After the first deploy finishes, copy the Render service URL and append `/verify`.

Example:

```text
https://ell-npi-verifier.onrender.com/verify
```

5. In Shopify admin, update the theme setting `Provider Access > NPI verification endpoint` to that full HTTPS URL.
6. Test the health check at `/health`, then test the modal on the storefront.

Notes:

- `starter` is used in `render.yaml` so the service stays awake more reliably than a free instance.
- If you want the cheapest possible test deploy, you can change `plan: starter` to `plan: free` before creating the service.
- If you use a Shopify preview domain, add it to `ALLOWED_ORIGINS` too.

## Important limitation

This gives the storefront **real NPI validation**, but because the current project is a Shopify theme, it is still a browser-side access gate for anonymous users.

For true hard access control, the next phase should be:

- approved provider accounts, or
- a Shopify app / app proxy that controls protected content on the server side
