interface Props {
  className?: string;
}

export default function EmailIcon({ className = "text-metro-text" }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 22 16"
      fill="none"
      className={className}
      preserveAspectRatio="xMinYMin"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M21.4468 3.91978 11.0662 9.11013c-.2155.1082-.4701.1082-.6856 0L0 3.91978v9.10152c0 .6099.242231 1.1939.67308 1.6248.43084.4308 1.01488.673 1.62477.673H19.1487c.6099 0 1.194-.2422 1.6248-.673.4309-.4309.6731-1.0149.6731-1.6248l.0002-9.10152ZM.00218135 2.20786 10.7235 7.56955l10.7213-5.36169c-.0229-.57639-.2613-1.12498-.6711-1.534776C20.3428.242238 19.7588 0 19.1489 0H2.29802C1.68813 0 1.10409.242233.673251.673084.263462 1.08288.0251721 1.6315.00218135 2.20786Z"
      />
    </svg>
  );
}
