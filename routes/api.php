<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\GuestAuthController;
use App\Http\Controllers\Api\V1\RoomController;
use App\Http\Controllers\Api\V1\NoteController;
use App\Http\Controllers\Api\V1\RelayAdminController;
use App\Http\Controllers\Api\V1\SignalController;
use App\Http\Controllers\Api\V1\HeartbeatController;

Route::prefix('v1')->group(function () {
    Route::post('/auth/guest', [GuestAuthController::class, 'store']);

    Route::prefix('relay')
        ->middleware('relay.auth')
        ->group(function () {
            Route::post('/sessions/upsert', [RelayAdminController::class, 'upsertSession']);
            Route::post('/sessions/prune', [RelayAdminController::class, 'pruneSessions']);

            // Persistence writes performed by the relay on behalf of guests
            Route::post('/rooms/{code}/snapshot', [RelayAdminController::class, 'saveOps']);
            Route::post('/rooms/{code}/notes', [RelayAdminController::class, 'saveNote']);
            Route::put('/rooms/{code}/notes/{noteId}', [RelayAdminController::class, 'moveNote']);
            Route::delete('/rooms/{code}/notes/{noteId}', [RelayAdminController::class, 'deleteNote']);
        });

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/me', [GuestAuthController::class, 'me']);

        Route::post('/rooms', [RoomController::class, 'store']);
        Route::post('/rooms/join', [RoomController::class, 'join']);
        Route::get('/rooms/{room:code}', [RoomController::class, 'show']);
        Route::post('/rooms/{room:code}/snapshot', [RoomController::class, 'snapshot']);
        Route::get('/rooms/{room:code}/snapshot', [RoomController::class, 'snapshotGet']);
        Route::post('/rooms/{room:code}/export', [RoomController::class, 'export']);

        Route::post('/rooms/{room:code}/notes', [NoteController::class, 'store']);
        Route::put('/rooms/{room:code}/notes/{note}', [NoteController::class, 'update']);
        Route::delete('/rooms/{room:code}/notes/{note}', [NoteController::class, 'destroy']);

        Route::get('/rooms/{room:code}/presence', [HeartbeatController::class, 'presence']);
        Route::post('/rooms/{room:code}/heartbeat', [HeartbeatController::class, 'heartbeat']);

        Route::post('/signal', [SignalController::class, 'store']);
        Route::get('/signal/poll', [SignalController::class, 'poll']);
    });
});
