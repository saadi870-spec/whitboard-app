<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>LaraBoard — realtime whiteboard</title>
    @viteReactRefresh
    @vite(['resources/js/main.jsx'])
</head>
<body class="bg-slate-950">
    <script>window.LARABOARD_WS = "{{ str_replace(['http://', 'https://'], ['ws://', 'wss://'], config('whiteboard.relay_url')) }}/upgr";</script>
    <div id="app"></div>
</body>
</html>
