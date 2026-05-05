interface Props {
  className?: string;
}

export default function AccessibilityIcon({ className = "text-metro-text" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 56 56"
      fill="none"
      className={className}
    >
      <path
        stroke="currentColor"
        strokeWidth="4"
        d="M28 2c14.374 0 26 11.626 26 26S42.374 54 28 54 2 42.374 2 28 13.626 2 28 2Z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M41.222 18.667c-4.06 1.089-8.82 1.555-13.222 1.555s-9.162-.466-13.222-1.555L14 21.777c2.893.779 6.222 1.292 9.333 1.556v20.223h3.111v-9.334h3.112v9.334h3.11V23.333c3.112-.264 6.44-.777 9.334-1.555zm-13.222 0a3.12 3.12 0 0 0 3.111-3.111A3.12 3.12 0 0 0 28 12.444a3.12 3.12 0 0 0-3.111 3.112A3.12 3.12 0 0 0 28 18.666"
        clipRule="evenodd"
      />
    </svg>
  );
}
