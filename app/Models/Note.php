<?php

namespace App\Models;

use App\Support\Ids;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['room_id', 'author_id', 'body', 'x', 'y', 'color'])]
class Note extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (Note $note) {
            if (! $note->id) {
                $note->id = Ids::ulidish();
            }
        });
    }
}
