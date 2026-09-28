<?php

namespace App\Http\Rules;

use App\Models\Room;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class RoomExists implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value) || ! Room::where('code', strtoupper($value))->exists()) {
            $fail('No board exists with that code.');
        }
    }
}
