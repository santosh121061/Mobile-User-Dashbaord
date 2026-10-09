<?php

// Reproducible neutral development mark. Production branding is configured before distribution.
$directory = dirname(__DIR__).'/assets';
if (! is_dir($directory)) {
    mkdir($directory, 0755, true);
}
$image = imagecreatetruecolor(1024, 1024);
$blue = imagecolorallocate($image, 37, 99, 235);
$white = imagecolorallocate($image, 255, 255, 255);
imagefill($image, 0, 0, $blue);
imagefilledellipse($image, 512, 350, 260, 260, $white);
imagefilledellipse($image, 512, 760, 600, 370, $white);
imagepng($image, $directory.'/development-mark.png', 9);
unset($image);
