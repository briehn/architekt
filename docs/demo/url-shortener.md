# URL shortener

## Overview

- Components: 8
- Connections: 7
- Boundaries: 1

Design Brief prose is user-authored and unverified.

## Requirements and constraints

Create short links and resolve redirects without waiting for click reporting\.\
Record click events for later analytics\.

## Assumptions and open questions

Expected traffic and cache hit rate are not specified\. Confirm redirect volume and retention requirements before sizing the system\.

## Decisions and tradeoffs

Use a cache for frequent mappings backed by the URL database; a cache miss adds a database read\. Send click events to a queue so reporting is off the redirect path; analytics become eventually consistent\.

## Components

- API Gateway — Gateway
- Analytics Worker — Service
- Browser — Client
- Click Events — Queue
- Link Service — Service
- Redirect Cache — Cache
- Reporting Database — Database
- URL Database — Database

## Boundaries

### Click analytics

- Analytics Worker
- Click Events
- Reporting Database

## Connections

- API Gateway → Link Service — Request/response
- Analytics Worker → Reporting Database — Data access
- Browser → API Gateway — Request/response
- Click Events → Analytics Worker — Async messaging
- Link Service → Click Events — Async messaging
- Link Service → Redirect Cache — Data access
- Link Service → URL Database — Data access
