import Column from "./Column";
import SocialIcon from "./SocialIcon";

export default function Footer() {
  const socialIconClasses = "fill-white w-8 mx-4";
  const linkClassName = "underline pointer";
  const copyrightYear = new Date().getFullYear();

  return (
    <footer className="bg-black text-center text-white">
      <Column narrow className="py-12">
        <h3 className="text-3xl font-bold">Connect with Metro</h3>
        <p className="mt-3">
          Metro’s mission is to provide a world-class transportation system that
          enhances quality of life for all who live, work, and play within LA
          County.
        </p>
        <div className="my-10 flex justify-center">
          <SocialIcon platform="facebook" className={socialIconClasses} />
          <SocialIcon platform="instagram" className={socialIconClasses} />
          <SocialIcon platform="tiktok" className={socialIconClasses} />
          <SocialIcon platform="youtube" className={socialIconClasses} />
          <SocialIcon platform="linkedin" className={socialIconClasses} />
        </div>
        <div className="mb-10">
          <a
            className={linkClassName}
            href="https://www.metro.net/about/privacy-policy/"
          >
            Privacy Policy
          </a>{" "}
          |{" "}
          <a
            className={linkClassName}
            href="https://www.metro.net/about/copyright/"
          >
            Terms of Use
          </a>
        </div>
        <p>©{copyrightYear} Metro</p>
      </Column>
    </footer>
  );
}
