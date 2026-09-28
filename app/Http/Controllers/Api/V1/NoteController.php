<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Note;
use App\Models\Room;
use App\Support\Ids;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NoteController extends Controller
{
    public function store(Request $request, Room $room): JsonResponse
    {
        $data = $request->validate([
            'id' => ['nullable', 'string', 'max:32'],
            'body' => ['required', 'string', 'max:2000'],
            'x' => ['required', 'integer', 'min:0', 'max:100000'],
            'y' => ['required', 'integer', 'min:0', 'max:100000'],
            'color' => ['nullable', 'string', 'max:24'],
        ]);

        $note = Note::create([
            'id' => $data['id'] ?? Ids::ulidish(),
            'room_id' => $room->id,
            'author_id' => $request->user()->id,
            'body' => $data['body'],
            'x' => $data['x'],
            'y' => $data['y'],
            'color' => $data['color'] ?? 'amber',
        ]);

        return response()->json(['note' => $this->shape($note)], 201);
    }

    public function update(Request $request, Room $room, Note $note): JsonResponse
    {
        abort_unless($note->room_id === $room->id, 404);

        $data = $request->validate([
            'body' => ['sometimes', 'string', 'max:2000'],
            'x' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'y' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'color' => ['sometimes', 'string', 'max:24'],
        ]);

        $note->update($data);

        return response()->json(['note' => $this->shape($note)]);
    }

    public function destroy(Room $room, Note $note): JsonResponse
    {
        abort_unless($note->room_id === $room->id, 404);
        $note->delete();

        return response()->json(['ok' => true]);
    }

    private function shape(Note $note): array
    {
        return [
            'id' => $note->id,
            'body' => $note->body,
            'x' => $note->x,
            'y' => $note->y,
            'color' => $note->color,
            'author' => $note->author_id,
        ];
    }
}
