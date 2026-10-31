# Metrics

rehub exposes counters for the whole farm at `GET /api/v1/metrics`, in the
[Prometheus text exposition format](https://prometheus.io/docs/instrumenting/exposition_formats/).

The operation is reserved to administrators: it is tagged `admin` in the API specification and the
controller checks the caller's privilege too, for access tokens and browser sessions alike. The
counters cover every device, user and group, which a plain user may not see.

Values are computed when the endpoint is scraped, not on a timer.

## Exposed metrics

| Metric | Labels | Description |
| ------ | ------ | ----------- |
| `rehub_devices_total` | | Devices known, present or not |
| `rehub_devices_by_state` | `state` | Devices per aggregate state (see below) |
| `rehub_devices_available` | | Devices in the `available` state |
| `rehub_devices_busy` | | Devices in the `busy` state |
| `rehub_providers_total` | | Distinct providers serving at least one present device |
| `rehub_users_total` | | Users known |
| `rehub_users_by_privilege` | `privilege` | Users per privilege (`root`, `admin`, `user`) |
| `rehub_groups_total` | | Groups known |
| `rehub_groups_active` | | Groups currently active |
| `rehub_groups_by_state` | `state` | Groups per state (`pending`, `ready`, `waiting`) |
| `rehub_groups_by_class` | `class` | Groups per class (`once`, `bookable`, `standard`, `hourly`, ...) |

All metrics are gauges and carry the `app="rehub"` label. The API process's standard `process_*` and
`nodejs_*` metrics are exposed as well.

Device states follow the device list:

| State | Meaning |
| ----- | ------- |
| `absent` | Not plugged into any provider |
| `offline` | Present, but adb reports it offline |
| `unauthorized` | Present, but adb is not authorized on it |
| `preparing` | Online but not ready yet |
| `unhealthy` | Reported unhealthy by its provider |
| `available` | Ready and owned by nobody (a free iPhone counts here too) |
| `busy` | Ready and owned by a user |
| `present` | Present and still connecting or authorizing |

The device list's `using` and `automation` states are left out: they only make sense for a given
user session. Every label value is known in advance, so a counter that drops to zero is exported as
zero, and an unexpected value in the database cannot create new time series.

## Scraping

Create an access token while logged in as an administrator (*Settings* > *Keys* > *Access Tokens*)
and give it to Prometheus:

```yaml
scrape_configs:
  - job_name: rehub
    metrics_path: /api/v1/metrics
    scheme: https
    authorization:
      type: Bearer
      credentials_file: /etc/prometheus/rehub-token
    static_configs:
      - targets: ['rehub.example.org']
```
