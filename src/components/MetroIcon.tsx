interface Props {
  className?: string;
}

export default function MetroIcon({ className = "text-metro-text" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 45.04 45.04"
      className={className}
      preserveAspectRatio="xMinYMin"
    >
      <path
        fill="currentColor"
        d="M22.52 0C10.09 0 0 10.07 0 22.52s10.09 22.52 22.52 22.52 22.51-10.07 22.51-22.52S34.95 0 22.52 0Zm-2.43 36.13s-5.04-14.48-5.32-15.25v15.25H9.11V9.12h6.95l9.09 27.02h-5.06Zm16.02 0h-5.67V20.88c-.22.6-3.3 9.5-4.32 12.51l-2.54-7.57 5.58-16.71h6.96v27.02Z"
      ></path>
    </svg>
  );
}
