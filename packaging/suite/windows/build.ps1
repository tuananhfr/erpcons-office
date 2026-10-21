param([Parameter(Mandatory)][string]$Version)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
Add-Type -AssemblyName System.Drawing
$iconPath = Join-Path $PWD 'suite.ico'
$image = [System.Drawing.Image]::FromFile((Join-Path $PWD 'public/brand/van-phong-icon-512.png'))
$streams = @()
try {
    foreach ($size in @(16, 32, 48, 64, 128, 256)) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.DrawImage($image, 0, 0, $size, $size)
            $stream = [System.IO.MemoryStream]::new()
            $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
            $streams += @{ Size = $size; Bytes = $stream.ToArray() }
            $stream.Dispose()
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $image.Dispose() }
$writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create($iconPath))
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$streams.Count)
    $offset = 6 + 16 * $streams.Count
    foreach ($entry in $streams) {
        $dimension = if ($entry.Size -eq 256) { 0 } else { $entry.Size }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$entry.Bytes.Length); $writer.Write([uint32]$offset)
        $offset += $entry.Bytes.Length
    }
    foreach ($entry in $streams) { $writer.Write([byte[]]$entry.Bytes) }
} finally { $writer.Dispose() }
New-Item -ItemType Directory -Force artifacts, portable | Out-Null
wix build packaging/suite/windows/VanPhong.wxs -arch x64 -ext WixToolset.BootstrapperApplications.wixext `
    -d "Version=$Version" -d "InputDir=$PWD/inputs" -d "IconPath=$iconPath" `
    -d "LocalizationPath=$PWD/packaging/suite/windows/vi.wxl" `
    -o artifacts/ERPCons-VanPhong-windows-x64-setup.exe
foreach ($base in @('VanBan', 'BangTinh', 'TrinhChieu', 'PDF')) {
    $unpacked = Join-Path $PWD "unpacked-$base"
    Expand-Archive "inputs/$base/ERPCons-$base-windows-x64-portable.zip" $unpacked
    $children = @(Get-ChildItem $unpacked -Force)
    # Fork archives wrap their binaries in a versioned directory.
    $source = if ($children.Count -eq 1 -and $children[0].PSIsContainer) { $children[0].FullName } else { $unpacked }
    New-Item -ItemType Directory "portable/$base" | Out-Null
    Get-ChildItem $source -Force | Copy-Item -Destination "portable/$base" -Recurse
    Remove-Item $unpacked -Recurse -Force
}
@'
ERPCons Văn phòng — Văn bản, Bảng tính, Trình chiếu và PDF.
Giải nén toàn bộ tệp ZIP, mở thư mục ứng dụng và chạy tệp .exe tương ứng.
Không cần cài đặt. Giữ nguyên các tệp đi kèm trong mỗi thư mục.
'@ | Set-Content portable/HUONG-DAN.txt -Encoding utf8
Compress-Archive -Path portable/* -DestinationPath artifacts/ERPCons-VanPhong-windows-x64-portable.zip
