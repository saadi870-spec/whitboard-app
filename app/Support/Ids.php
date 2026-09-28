<?php

namespace App\Support;

final class Ids
{
    /** 26-char, time-prefixed Crockford-ish id: sortable, SQLite friendly. */
    public static function ulidish(): string
    {
        $ms = (int) floor(microtime(true) * 1000);
        $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

        $t = '';
        $n = $ms;
        for ($i = 0; $i < 10; $i++) {
            $t = $alphabet[$n % 32].$t;
            $n = intdiv($n, 32);
        }

        $r = '';
        for ($i = 0; $i < 16; $i++) {
            $r .= $alphabet[random_int(0, 31)];
        }

        return $t.$r;
    }
}
