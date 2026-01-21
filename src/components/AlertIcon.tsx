interface Props {
  className?: string;
}

export default function ArrowIcon({ className = "text-metro-text" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      preserveAspectRatio="xMinYMin"
    >
      <path
        fill="currentColor"
        d="M0 22h24L12 1 0 22Zm13.0909-3.3158h-2.1818v-2.2105h2.1818v2.2105Zm0-4.421h-2.1818V9.8421h2.1818v4.4211Z"
      />
    </svg>
  );
}
