<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Redis;

/**
 * WebRTC signaling fallback used when the relay is unreachable.
 * Signals live in Redis with a 60s TTL and are drained by long-poll.
 */
class SignalController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'room' => ['required', 'string', 'max:12'],
            'to' => ['required', 'string', 'max:64'],
            'signal' => ['required', 'array'],
        ]);

        $key = 'signal:'.$data['room'].':'.$data['to'];
        Redis::rpush($key, json_encode([
            'from' => $request->user()->id,
            'signal' => $data['signal'],
            'at' => now()->toIso8601String(),
        ]));
        Redis::expire($key, 60);
        Redis::ltrim($key, -50, -1);

        return response()->json(['ok' => true]);
    }

    public function poll(Request $request): JsonResponse
    {
        $request->validate(['room' => ['required', 'string', 'max:12']]);

        $key = 'signal:'.$request->input('room').':'.$request->user()->id;
        $deadline = microtime(true) + 20.0;

        while (microtime(true) < $deadline) {
            $items = Redis::lrange($key, 0, -1);
            if ($items !== []) {
                Redis::del($key);

                return response()->json([
                    'signals' => array_map(fn ($raw) => json_decode($raw, true), $items),
                ]);
            }
            usleep(400_000);
        }

        return response()->json(['signals' => []]);
    }
}
