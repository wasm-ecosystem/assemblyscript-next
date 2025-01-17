export function bswap<T extends number>(value: T): T {
  if (isInteger<T>()) {
    if (sizeof<T>() == 1) {
      return value;
    }
    if (sizeof<T>() == 2) {
      return <T>(((<u16>value) << 8) | ((<u16>value) >> 8));
    }
    if (sizeof<T>() == 4) {
      return <T>(rotl((<u32>value) & 0xff00ff00, 8) | rotr((<u32>value) & 0x00ff00ff, 8));
    }
    if (sizeof<T>() == 8) {
      let a = ((<u64>value) >> 8) & 0x00ff00ff00ff00ff;
      let b = ((<u64>value) & 0x00ff00ff00ff00ff) << 8;
      let v = a | b;

      a = (v >>> 16) & 0x0000ffff0000ffff;
      b = (v & 0x0000ffff0000ffff) << 16;

      return <T>rotr(a | b, 32);
    }
  }
  ERROR("Unsupported generic type");
}
