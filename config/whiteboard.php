<?php

return [
    // Internal bearer token the Node relay presents to Laravel's admin endpoints.
    'relay_secret' => env('RELAY_SECRET', 'dev-relay-secret-change-me'),

    // The relay's base URL (used by Laravel HTTP client and the browser).
    'relay_url' => env('RELAY_URL', 'http://127.0.0.1:6002'),

    // Guests receive an expiring token; renew before this many minutes.
    'token_ttl' => (int) env('WB_TOKEN_TTL', 60 * 24 * 7),

    // Presence slots older than this are considered stale.
    'presence_ttl' => (int) env('WB_PRESENCE_TTL', 40),

    // Ops per POST /snapshot accepted before truncation.
    'max_ops_per_snapshot' => (int) env('WB_MAX_OPS', 5000),
];
