<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rooms', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('code', 12)->unique();
            $table->string('name')->default('Untitled board');
            $table->foreignId('owner_id')->nullable()->index();
            $table->unsignedBigInteger('revision')->default(0);
            $table->timestamp('last_activity_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('guests', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('display_name', 40);
            $table->string('color', 9);
            $table->string('room_id', 32)->nullable()->index();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });

        Schema::create('personal_access_tokens', function (Blueprint $table) {
            $table->id();
            $table->morphs('tokenable');
            $table->string('name');
            $table->string('token', 64)->unique();
            $table->text('abilities')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('board_ops', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('room_id', 32)->index();
            $table->string('guest_id', 32)->index();
            $table->string('kind', 24);
            $table->json('payload');
            $table->string('client_ref', 64)->nullable();
            $table->unsignedBigInteger('revision')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->index(['room_id', 'created_at']);
            $table->unique(['room_id', 'client_ref']);
        });

        Schema::create('notes', function (Blueprint $table) {
            $table->string('id', 32)->primary();
            $table->string('room_id', 32)->index();
            $table->string('author_id', 32)->nullable();
            $table->string('body', 2000)->default('');
            $table->unsignedInteger('x')->default(0);
            $table->unsignedInteger('y')->default(0);
            $table->string('color', 24)->default('amber');
            $table->timestamps();
        });

        Schema::create('relay_sessions', function (Blueprint $table) {
            $table->string('socket_id', 64)->primary();
            $table->string('room_code', 12)->index();
            $table->string('guest_id', 32)->index();
            $table->string('user_agent', 255)->nullable();
            $table->timestamp('last_seen_at')->nullable()->index();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('relay_sessions');
        Schema::dropIfExists('notes');
        Schema::dropIfExists('board_ops');
        Schema::dropIfExists('personal_access_tokens');
        Schema::dropIfExists('guests');
        Schema::dropIfExists('rooms');
    }
};
