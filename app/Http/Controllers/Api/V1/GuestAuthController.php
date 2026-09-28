<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Guest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class GuestAuthController extends Controller
{
    /** Issue a guest identity + API token. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:40'],
            'color' => ['nullable', 'string', Rule::in($this->palette())],
        ]);

        $guest = Guest::query()->create([
            'display_name' => $data['name'] ?? $this->randomName(),
            'color' => $data['color'] ?? $this->palette()[array_rand($this->palette())],
        ]);

        $token = $guest->createToken('guest', ['*'], now()->addMinutes(config('whiteboard.token_ttl')));

        return response()->json([
            'guest' => [
                'id' => $guest->id,
                'name' => $guest->display_name,
                'color' => $guest->color,
            ],
            'token' => $token->plainTextToken,
            'expires_at' => optional($token->accessToken->expires_at)->toIso8601String(),
        ], 201);
    }

    public function me(Request $request): JsonResponse
    {
        $guest = $request->user();

        return response()->json([
            'guest' => [
                'id' => $guest->id,
                'name' => $guest->display_name,
                'color' => $guest->color,
            ],
        ]);
    }

    private function palette(): array
    {
        return ['#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
    }

    private function randomName(): string
    {
        $adjectives = ['Swift', 'Cosmic', 'Neon', 'Quiet', 'Bold', 'Lucky', 'Fuzzy', 'Atomic', 'Pixel', 'Turbo'];
        $animals = ['Otter', 'Falcon', 'Panda', 'Cactus', 'Koala', 'Tiger', 'Mango', 'Puffin', 'Gecko', 'Narwhal'];

        return $adjectives[array_rand($adjectives)].' '.$animals[array_rand($animals)];
    }
}
