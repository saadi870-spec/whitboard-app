<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RelayAuth
{
    /** Authenticate the internal Node relay via fixed bearer token. */
    public function handle(Request $request, Closure $next): Response
    {
        $expected = 'Bearer '.config('whiteboard.relay_secret');
        $given = $request->header('Authorization', '');

        if (! hash_equals($expected, $given)) {
            return response()->json(['message' => 'Unrecognized relay.'], 401);
        }

        return $next($request);
    }
}
