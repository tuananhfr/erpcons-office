/* eslint-disable @next/next/no-html-link-for-pages -- Static hosting uses full navigation without RSC rewrites. */
import Image from 'next/image'

export function Brand() {
  return <a href="/" className="erp-brand" aria-label="Office by ERPCons, trang chủ">
    <Image className="erp-brand__mark" src="/brand/office/office-mark.png" alt="" width={64} height={64} priority />
    <span className="erp-brand__text">Offi<span className="erp-brand__accent">ce</span><small>by ERPCons</small></span>
  </a>
}
