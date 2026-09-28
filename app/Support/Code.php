<?php

namespace App\Support;

class Code
{
    private const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    public static function room(): string
    {
        $out = '';
        for ($i = 0; $i < 7; $i++) {
            $out .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }

        return $out;
    }
}
