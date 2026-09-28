<?php

namespace App\Models;

use App\Support\Ids;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['display_name', 'color', 'room_id', 'last_seen_at'])]
class Guest extends Model implements AuthenticatableContract
{
    use HasApiTokens;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'guests';

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Guest $guest) {
            if (! $guest->id) {
                $guest->id = Ids::ulidish();
            }
        });
    }

    // ── Minimal Authenticatable contract (token-only identity) ──────────────────

    public function getAuthIdentifierName(): string
    {
        return 'id';
    }

    public function getAuthIdentifier(): string
    {
        return $this->id;
    }

    public function getAuthPassword(): string
    {
        return '';
    }

    public function getAuthPasswordName(): string
    {
        return '';
    }

    public function getRememberToken(): string
    {
        return '';
    }

    public function setRememberToken($value): void
    {
    }

    public function getRememberTokenName(): string
    {
        return '';
    }
}
