<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Rules\RoomExists;
use App\Models\BoardOp;
use App\Models\RelaySession;
use App\Models\Room;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RoomController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:80'],
        ]);

        $room = Room::create([
            'name' => $data['name'] ?? 'Untitled board',
            'owner_id' => $request->user()->id,
            'last_activity_at' => now(),
        ]);

        return response()->json($this->roomPayload($room, $request), 201);
    }

    public function join(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:12', new RoomExists],
        ]);

        $room = Room::where('code', strtoupper(trim($data['code'])))->firstOrFail();

        $request->user()->update([
            'room_id' => $room->id,
            'last_seen_at' => now(),
        ]);

        return response()->json($this->roomPayload($room, $request));
    }

    public function show(Request $request, Room $room): JsonResponse
    {
        return response()->json($this->roomPayload($room, $request));
    }

    /** Append a batch of ops (relay flush) and bump the revision. */
    public function snapshot(Request $request, Room $room): JsonResponse
    {
        $data = $request->validate([
            'ops' => ['required', 'array', 'max:'.config('whiteboard.max_ops_per_snapshot')],
            'ops.*.kind' => ['required', 'string', 'max:24'],
            'ops.*.payload' => ['required', 'array'],
            'ops.*.client_ref' => ['required', 'string', 'max:64'],
            'ops.*.rev' => ['nullable', 'integer', 'min:0'],
        ]);

        $guest = $request->user();
        $rows = [];
        foreach ($data['ops'] as $op) {
            $rows[] = [
                'id' => Ids::ulidish(),
                'room_id' => $room->id,
                'guest_id' => $guest->id,
                'kind' => $op['kind'],
                'payload' => json_encode($op['payload']),
                'client_ref' => $op['client_ref'],
                'revision' => $op['rev'] ?? null,
                'created_at' => now(),
            ];
        }

        DB::transaction(function () use ($rows, $room) {
            BoardOp::insertOrIgnore($rows); // idempotent per (room, client_ref)
            $room->increment('revision', count($rows));
            $room->update(['last_activity_at' => now()]);
        });

        return response()->json(['ok' => true, 'stored' => count($rows)]);
    }

    public function snapshotGet(Request $request, Room $room): JsonResponse
    {
        $ops = BoardOp::query()
            ->where('room_id', $room->id)
            ->orderBy('created_at')
            ->orderBy('id')
            ->limit(config('whiteboard.max_ops_per_snapshot'))
            ->get(['id', 'guest_id', 'kind', 'payload', 'client_ref', 'revision', 'created_at']);

        return response()->json([
            'room' => $this->roomPayload($room, $request),
            'ops' => $ops->map(fn (BoardOp $op) => [
                'id' => $op->id,
                'kind' => $op->kind,
                'payload' => $op->payload,
                'ref' => $op->client_ref,
                'by' => $op->guest_id,
                'at' => optional($op->created_at)->toIso8601String(),
            ])->all(),
            'notes' => $room->notes()->orderBy('created_at')->get()->map(fn ($n) => [
                'id' => $n->id, 'body' => $n->body, 'x' => $n->x, 'y' => $n->y,
                'color' => $n->color, 'author' => $n->author_id,
            ])->all(),
        ]);
    }

    public function export(Request $request, Room $room): JsonResponse
    {
        $ops = BoardOp::where('room_id', $room->id)->orderBy('created_at')->get();
        $notes = $room->notes()->orderBy('created_at')->get();
        $sessions = RelaySession::where('room_code', $room->code)->get();

        return response()->json([
            'meta' => [
                'app' => 'LaraBoard',
                'version' => 1,
                'exported_at' => now()->toIso8601String(),
                'room' => ['id' => $room->id, 'code' => $room->code, 'name' => $room->name],
            ],
            'ops' => $ops->map(fn ($o) => [
                'kind' => $o->kind, 'payload' => $o->payload,
                'by' => $o->guest_id, 'at' => optional($o->created_at)->toIso8601String(),
            ])->all(),
            'notes' => $notes->map(fn ($n) => [
                'body' => $n->body, 'x' => $n->x, 'y' => $n->y, 'color' => $n->color,
            ])->all(),
            'participants' => $sessions->map(fn ($s) => [
                'guest' => $s->guest_id, 'since' => optional($s->created_at)->toIso8601String(),
            ])->all(),
        ])->header('Content-Disposition', 'attachment; filename="board-'.$room->code.'.json"');
    }

    private function roomPayload(Room $room, Request $request): array
    {
        return [
            'id' => $room->id,
            'code' => $room->code,
            'name' => $room->name,
            'revision' => (int) $room->revision,
            'is_owner' => $room->owner_id !== null && $room->owner_id === $request->user()?->id,
        ];
    }
}
