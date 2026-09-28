<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\BoardOp;
use App\Models\Guest;
use App\Models\Note;
use App\Models\RelaySession;
use App\Models\Room;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Endpoints called by the Node relay (bearer-authenticated via relay.auth). */
class RelayAdminController extends Controller
{
    public function upsertSession(Request $request): JsonResponse
    {
        $data = $request->validate([
            'socket_id' => ['required', 'string', 'max:64'],
            'room_code' => ['required', 'string', 'max:12'],
            'guest_id' => ['required', 'string', 'max:32'],
            'user_agent' => ['nullable', 'string', 'max:255'],
        ]);

        RelaySession::updateOrCreate(
            ['socket_id' => $data['socket_id']],
            [
                'room_code' => strtoupper($data['room_code']),
                'guest_id' => $data['guest_id'],
                'user_agent' => $data['user_agent'] ?? null,
                'last_seen_at' => now(),
                'created_at' => now(),
            ]
        );

        Guest::where('id', $data['guest_id'])->update(['last_seen_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function pruneSessions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'socket_ids' => ['required', 'array', 'max:2000'],
            'socket_ids.*' => ['string', 'max:64'],
        ]);

        RelaySession::whereIn('socket_id', $data['socket_ids'])->delete();

        return response()->json(['ok' => true]);
    }

    /** Persist a batch of board ops on behalf of a guest (called by the relay). */
    public function saveOps(Request $request, string $code): JsonResponse
    {
        $data = $request->validate([
            'ops' => ['required', 'array', 'max:'.config('whiteboard.max_ops_per_snapshot')],
            'ops.*.kind' => ['required', 'string', 'max:24'],
            'ops.*.payload' => ['required', 'array'],
            'ops.*.client_ref' => ['required', 'string', 'max:64'],
            'ops.*.guest' => ['required', 'string', 'max:32'],
        ]);

        $room = Room::where('code', strtoupper($code))->first();
        if (! $room) {
            return response()->json(['ok' => false, 'reason' => 'unknown_room']);
        }

        $rows = [];
        foreach ($data['ops'] as $op) {
            $rows[] = [
                'id' => Ids::ulidish(),
                'room_id' => $room->id,
                'guest_id' => $op['guest'],
                'kind' => $op['kind'],
                'payload' => json_encode($op['payload']),
                'client_ref' => $op['client_ref'],
                'created_at' => now(),
            ];
        }

        DB::transaction(function () use ($rows, $room) {
            BoardOp::insertOrIgnore($rows);
            $room->increment('revision', count($rows));
            $room->update(['last_activity_at' => now()]);
        });

        return response()->json(['ok' => true, 'stored' => count($rows)]);
    }

    /** Persist a sticky note created by a guest (called by the relay). */
    public function saveNote(Request $request, string $code): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'string', 'max:32'],
            'body' => ['required', 'string', 'max:2000'],
            'x' => ['required', 'integer', 'min:0'],
            'y' => ['required', 'integer', 'min:0'],
            'color' => ['nullable', 'string', 'max:24'],
        ]);

        $room = Room::where('code', strtoupper($code))->first();
        if (! $room) {
            return response()->json(['ok' => false]);
        }

        Note::updateOrCreate(
            ['id' => $data['id'], 'room_id' => $room->id],
            [
                'body' => $data['body'],
                'x' => $data['x'],
                'y' => $data['y'],
                'color' => $data['color'] ?? 'amber',
            ]
        );

        return response()->json(['ok' => true]);
    }

    /** Persist a sticky note move (called by the relay). */
    public function moveNote(Request $request, string $code, string $noteId): JsonResponse
    {
        $data = $request->validate([
            'x' => ['required', 'integer', 'min:0'],
            'y' => ['required', 'integer', 'min:0'],
        ]);

        $room = Room::where('code', strtoupper($code))->first();
        if (! $room) {
            return response()->json(['ok' => false]);
        }

        Note::where('room_id', $room->id)->where('id', $noteId)->update([
            'x' => $data['x'],
            'y' => $data['y'],
        ]);

        return response()->json(['ok' => true]);
    }

    /** Persist a sticky note delete (called by the relay). */
    public function deleteNote(string $code, string $noteId): JsonResponse
    {
        $room = Room::where('code', strtoupper($code))->first();
        if ($room) {
            Note::where('room_id', $room->id)->where('id', $noteId)->delete();
        }

        return response()->json(['ok' => true]);
    }
}
