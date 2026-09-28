<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use App\Models\RelaySession;
use App\Models\Room;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HeartbeatController extends Controller
{
    /** HTTP heartbeat fallback (the relay websocket is the primary presence source). */
    public function heartbeat(Request $request, Room $room): JsonResponse
    {
        $request->user()->update([
            'room_id' => $room->id,
            'last_seen_at' => now(),
        ]);
        $room->update(['last_activity_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function presence(Request $request, Room $room): JsonResponse
    {
        $sessions = RelaySession::query()
            ->where('room_code', $room->code)
            ->where('last_seen_at', '>=', now()->subSeconds(config('whiteboard.presence_ttl')))
            ->get();

        $guests = Guest::query()
            ->whereIn('id', $sessions->pluck('guest_id'))
            ->get()
            ->keyBy('id');

        return response()->json([
            'presence' => $sessions->map(function (RelaySession $s) use ($guests) {
                $g = $guests->get($s->guest_id);

                return [
                    'socket' => $s->socket_id,
                    'guest' => $s->guest_id,
                    'name' => $g?->display_name ?? 'Guest',
                    'color' => $g?->color ?? '#888888',
                    'since' => optional($s->created_at)->toIso8601String(),
                ];
            })->values()->all(),
        ]);
    }
}
