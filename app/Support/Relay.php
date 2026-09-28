<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Throwable;

class Relay
{
    /** Tell the Node relay to drop a room's state (best effort). */
    public static function evictRoom(string $code): void
    {
        try {
            Http::baseUrl(config('whiteboard.relay_url'))
                ->withToken(config('whiteboard.relay_secret'))
                ->timeout(1)
                ->acceptJson()
                ->post('/internal/rooms/evict', ['room' => $code])
                ->throw();
        } catch (Throwable) {
            // Relay may be restarting; it also evicts idle rooms itself.
        }
    }
}
