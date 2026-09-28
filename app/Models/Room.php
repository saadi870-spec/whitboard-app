<?php

namespace App\Models;

use App\Support\Code;
use App\Support\Ids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'code', 'owner_id', 'revision', 'last_activity_at'])]
class Room extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected function casts(): array
    {
        return [
            'revision' => 'integer',
            'last_activity_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Room $room) {
            if (! $room->id) {
                $room->id = Ids::ulidish();
            }
            if (! $room->code) {
                do {
                    $candidate = Code::room();
                } while (Room::where('code', $candidate)->exists());
                $room->code = $candidate;
            }
        });
    }

    public function ops(): HasMany
    {
        return $this->hasMany(BoardOp::class);
    }

    public function notes(): HasMany
    {
        return $this->hasMany(Note::class);
    }
}
