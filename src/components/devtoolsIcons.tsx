// Icons of the DevTools frontend (devtools://devtools/bundled/Images/*.svg),
// so the toolbar reads like the Network tab's. They paint in currentColor and
// take their size from CSS
import { SVGProps } from "react";

const DevtoolsIcon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
);

// Images/clear.svg: the Network tab's "Clear network log"
export const ClearIcon = (props: SVGProps<SVGSVGElement>) => (
  <DevtoolsIcon {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M17.5 10a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0ZM16 10a6 6 0 0 1-9.68 4.74l8.42-8.42A5.974 5.974 0 0 1 16 10ZM5.26 13.68l8.42-8.42a6 6 0 0 0-8.42 8.42Z"
    />
  </DevtoolsIcon>
);

// Images/filter.svg: the funnel inside the Network filter field
export const FilterIcon = (props: SVGProps<SVGSVGElement>) => (
  <DevtoolsIcon {...props}>
    <path d="M9.5 16a.482.482 0 0 1-.354-.146A.482.482 0 0 1 9 15.5v-4.729L4.104 4.812a.48.48 0 0 1-.052-.531A.463.463 0 0 1 4.5 4h11c.208 0 .357.094.448.281a.48.48 0 0 1-.052.531L11 10.771V15.5a.482.482 0 0 1-.146.354.482.482 0 0 1-.354.146h-1Zm.5-6.375L13.375 5.5H6.604L10 9.625Z" />
  </DevtoolsIcon>
);

// Images/cross-circle-filled.svg: the filter field's clear button
export const CrossCircleFilledIcon = (props: SVGProps<SVGSVGElement>) => (
  <DevtoolsIcon {...props}>
    <path d="M7.062 14 10 11.062 12.938 14 14 12.938 11.062 10 14 7.062 12.938 6 10 8.938 7.062 6 6 7.062 8.938 10 6 12.938 7.062 14ZM10 18a7.794 7.794 0 0 1-3.104-.625 8.067 8.067 0 0 1-2.552-1.719 8.065 8.065 0 0 1-1.719-2.552A7.795 7.795 0 0 1 2 10c0-1.111.208-2.15.625-3.115a8.066 8.066 0 0 1 4.271-4.26A7.795 7.795 0 0 1 10 2c1.111 0 2.15.208 3.115.625a8.1 8.1 0 0 1 4.26 4.26C17.792 7.85 18 8.889 18 10a7.794 7.794 0 0 1-.625 3.104 8.066 8.066 0 0 1-4.26 4.271A7.775 7.775 0 0 1 10 18Z" />
  </DevtoolsIcon>
);

// Images/gear.svg: the Network tab's "Network settings"
export const GearIcon = (props: SVGProps<SVGSVGElement>) => (
  <DevtoolsIcon {...props}>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M8.935 16.094h2.14l.252-1.786.626-.338c.166-.089.32-.178.468-.275l.612-.4 1.72.688 1.063-1.84-1.465-1.147.05-.742c.008-.115.011-.18.011-.243s-.004-.128-.011-.243l-.05-.742 1.466-1.148-1.066-1.84-1.725.69-.612-.4a5.191 5.191 0 0 0-.457-.266l-.642-.333-.26-1.823H8.934l-.256 1.808-.626.337a6.35 6.35 0 0 0-.468.276l-.615.402-1.72-.694L4.19 7.86l1.47 1.15-.049.743a3.936 3.936 0 0 0-.011.243c0 .064.003.128.011.243l.05.746-1.473 1.145 1.057 1.83 1.719-.688.612.4c.148.097.297.183.456.266l.643.333.26 1.823Zm-3.446-.717a1.08 1.08 0 0 1-1.325-.476l-1.34-2.32c-.256-.484-.146-1.055.264-1.377l1.12-.87c-.007-.11-.015-.22-.015-.338 0-.11.008-.227.015-.336l-1.113-.872a1.053 1.053 0 0 1-.27-1.376l1.354-2.335a1.053 1.053 0 0 1 1.31-.461l1.325.534c.19-.124.38-.234.571-.337l.198-1.398c.066-.512.52-.915 1.054-.915h2.709c.541 0 .995.395 1.061.93l.198 1.383c.197.103.388.213.578.337l1.318-.527c.52-.19 1.083.022 1.332.476l1.347 2.328a1.076 1.076 0 0 1-.263 1.376l-1.113.871c.007.11.014.22.014.337 0 .117-.007.227-.014.337l1.113.87c.41.33.527.901.27 1.363l-1.361 2.357a1.06 1.06 0 0 1-1.318.461l-1.318-.527c-.19.124-.38.234-.57.337l-.198 1.398c-.073.498-.527.893-1.069.893H8.644c-.541 0-.995-.395-1.061-.93l-.198-1.383a6.584 6.584 0 0 1-.578-.337l-1.318.527Z"
    />
    <path d="M9.999 12.559a2.562 2.562 0 1 0 0-5.125 2.562 2.562 0 0 0 0 5.125Z" />
  </DevtoolsIcon>
);
