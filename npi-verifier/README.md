# ELL Provider Access Service

Small Node service used by the ELL Shopify theme for provider access workflows.

## Current production role

The storefront Provider Account Setup form posts to:

```text
/provider-registration
```

The service validates the submitted provider fields, then uses the Shopify Admin API to create or update a Shopify Customer record.

New or updated provider submissions receive these customer tags:

- `provider-registration`
- `provider-pending`

If a customer is already tagged `provider-approved`, the service preserves that approval tag.

## Shopify review flow

1. Provider submits the Provider Account Setup form.
2. This service creates or updates a Shopify Customer.
3. Shopify Flow can trigger from the customer tag `provider-pending`.
4. The ELL admin reviews the customer in Shopify Admin > Customers.
5. Admin approves by adding the `provider-approved` tag.
6. Admin may remove `provider-pending`.
7. The approved customer logs in and can access gated Product Catalog and Provider areas.

Shopify Liquid cannot securely add approval tags by itself. Approval must happen in Shopify Admin, Shopify Flow, or a custom app with Admin API access.

## Required Shopify app scopes

Create a Shopify custom app with Admin API access and grant:

- `read_customers`
- `write_customers`

Copy the Admin API access token into Render as `SHOPIFY_ADMIN_ACCESS_TOKEN`.

## Environment variables

- `PORT`: service port, default `8787`
- `HOST`: bind host, use `127.0.0.1` locally or `0.0.0.0` on Render
- `SHOPIFY_SHOP_DOMAIN`: Shopify shop domain, for example `elegance-at-the-cellular-level.myshopify.com`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`: Admin API token from the Shopify custom app
- `SHOPIFY_API_VERSION`: Admin API version, default `2025-10`
- `ALLOWED_ORIGINS`: comma-separated allowed browser origins
- `NPPES_API_URL`: legacy NPI lookup base URL, default `https://npiregistry.cms.hhs.gov/api/`

Recommended `ALLOWED_ORIGINS`:

```text
https://ellstemcells.com,https://www.ellstemcells.com,https://elegance-at-the-cellular-level.myshopify.com,http://127.0.0.1:9292,http://localhost:9292
```

Local loopback origins are accepted automatically for development previews.

## Run locally

```bash
cd /Users/vinard/Desktop/Sides/ELL/npi-verifier
npm start
```

Health check:

```text
http://127.0.0.1:8787/health
```

Provider registration endpoint:

```text
http://127.0.0.1:8787/provider-registration
```

## Example provider registration request

```bash
curl -X POST http://127.0.0.1:8787/provider-registration \
  -H 'Content-Type: application/json' \
  -d '{
    "first_name": "Sarah",
    "last_name": "Jenkins",
    "credentials": "MD",
    "email": "sarah@example.com",
    "phone": "555-555-5555",
    "medical_specialty": "Orthopedics",
    "clinic_or_institution": "Example Clinic",
    "city": "Austin",
    "state_or_province": "TX",
    "country": "United States"
  }'
```

## Contact endpoint

The Shopify `/contact` endpoint is not the provider database source of truth. It may still be used for general inquiries, but provider setup should use `/provider-registration` so submissions become Shopify Customer records and can trigger Flow.

## Legacy NPI endpoint

The old `/verify` route still exists for compatibility, but the current storefront no longer requires NPI verification before registration.
