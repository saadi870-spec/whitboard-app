<?php

namespace App\Models;

use App\Support\Ids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['room_id', 'guest_id', 'kind', 'payload', 'client_ref', 'revision'])]
class BoardOp extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (BoardOp $op) {
            if (! $op->id) {
                $op->id = Ids::ulidish();
            }
            $op->created_at ??= now();
        });
    }
}
