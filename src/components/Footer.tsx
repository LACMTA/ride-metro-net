import Button from "./Button";
import Column from "./Column";
import PhoneIcon from "./PhoneIcon";
import SocialIcon from "./SocialIcon";

export default function Footer() {
  const socialIconClasses = "fill-white w-8 mx-4";
  const linkClassName = "underline pointer";
  const copyrightYear = new Date().getFullYear();

  return (
    <footer className="bg-black text-center text-white">
      <Column narrow className="py-12">
        <h3 className="text-3xl font-bold">Need Help?</h3>
        <p className="mx-auto mt-3 max-w-80">
          Get help with fares, schedules, arrival times, service alerts, and
          transit connections:
        </p>
        <Button
          as="a"
          href="tel:3234663876"
          className="bg-background-white text-metro-text mt-3 inline-block"
        >
          <PhoneIcon className="mr-3 inline h-5" />
          323.GO.METRO (323.466.3876)
        </Button>
        <h3 className="mt-12 text-3xl font-bold">Connect with Metro</h3>
        <div className="mt-5 mb-10 flex justify-center">
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
