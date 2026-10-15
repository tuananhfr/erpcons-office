/* eslint-disable @next/next/no-html-link-for-pages -- Static hosting uses full navigation without RSC rewrites. */
import Image from 'next/image'

export function Brand() {
  return <a href="/" className="erp-brand" aria-label="Văn phòng by ERPCons, trang chủ">
    <Image className="erp-brand__mark" src="/brand/van-phong-logo.png" alt="" width={88} height={88} priority />
    <span className="erp-brand__text">Văn phòng<small>by <b>ERPCons</b></small></span>
  </a>
}
