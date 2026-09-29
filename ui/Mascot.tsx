import React from 'react';

const original = '../assets/blue-mascot-perched.png';
const cleanPlate = '../assets/blue-mascot-motion-base.png';

export function Mascot() {
  return <svg className="status-mascot" viewBox="0 0 1536 904.533" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="mascot-tail-cut">
        <path d="M1222 648 C1295 651 1252 601 1244 566 C1232 510 1238 447 1277 420 C1292 469 1355 468 1373 524 L1385 552 C1419 527 1453 527 1481 542 L1518 518 L1530 578 C1501 632 1441 649 1380 658 C1347 696 1304 715 1261 699 Z"/>
      </clipPath>
      <clipPath id="mascot-fringe-cut">
        <path d="M428 302 C378 324 345 394 350 467 C344 535 353 586 396 620 L381 589 C408 624 443 644 481 648 C461 625 465 613 480 590 C509 548 534 487 530 433 C520 365 477 309 428 302 Z"/>
      </clipPath>
      <clipPath id="mascot-eyes-cut">
        <path d="M243 558 Q314 536 374 566 L409 653 Q350 690 290 672 L266 647 Z M483 570 Q555 561 615 603 L645 635 Q605 704 515 700 L483 672 Z"/>
      </clipPath>
    </defs>
    <image className="mascot-body" href={cleanPlate} width="1536" height="1024"/>
    <g clipPath="url(#mascot-eyes-cut)">
      <image href={original} width="1536" height="1024"/>
      <g className="mascot-blink"><image href={cleanPlate} width="1536" height="1024"/></g>
    </g>
    <g className="mascot-tail"><image href={original} width="1536" height="1024" clipPath="url(#mascot-tail-cut)"/></g>
    <g className="mascot-fringe"><image href={original} width="1536" height="1024" clipPath="url(#mascot-fringe-cut)"/></g>
  </svg>;
}
