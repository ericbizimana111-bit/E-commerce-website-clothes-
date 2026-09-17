import { useState } from "react";
import "./Footer.css";

const BagIcon = () => (
    <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 01-8 0" />
    </svg>
);

const InstagramIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <rect x="2" y="2" width="20" height="20" rx="5" />
        <path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
);

const FacebookIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
    >
        <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z" />
    </svg>
);

const TwitterIcon = () => (
    <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
    >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const CheckIcon = () => (
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
    >
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const shopLinks = [
    "New Arrivals",
    "Best Sellers",
    "Sale & Offers",
    "Electronics",
];

const helpLinks = [
    "Track My Order",
    "Returns & Refunds",
    "FAQs",
    "Contact Support",
];

const socialLinks = [
    {
        name: "Instagram",
        icon: <InstagramIcon />,
    },
    {
        name: "Facebook",
        icon: <FacebookIcon />,
    },
    {
        name: "X / Twitter",
        icon: <TwitterIcon />,
    },
];

function Footer() {
    const [email, setEmail] = useState("");
    const [subscribed, setSubscribed] = useState(false);

    const handleSubscribe = () => {
        if (!email.trim()) {
            return;
        }

        if (!email.includes("@")) {
            return;
        }

        setSubscribed(true);
        setEmail("");
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSubscribe();
    };

    return (
        <footer className="footer">
            <div className="fc">

                {/* Footer top section */}
                <div className="ftop">

                    {/* Brand */}
                    <div className="fb">
                        <a href="/" className="fb-logo">
                            <div className="fb-icon">
                                <BagIcon />
                            </div>

                            <span className="fb-name">
                                SHOPPER
                            </span>
                        </a>

                        <p className="fb-desc">
                            Premium fashion, electronics & home goods.
                            Shop smarter, live better.
                        </p>

                        <div className="socials">
                            {socialLinks.map((social) => (
                                <a
                                    key={social.name}
                                    href="/"
                                    className="slink"
                                    aria-label={social.name}
                                    onClick={(e) => e.preventDefault()}
                                >
                                    {social.icon}
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Shop links */}
                    <div className="col">
                        <h4>Shop</h4>

                        <ul>
                            {shopLinks.map((link) => (
                                <li key={link}>
                                    <a
                                        href="/"
                                        onClick={(e) => e.preventDefault()}
                                    >
                                        {link}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Help links */}
                    <div className="col">
                        <h4>Help</h4>

                        <ul>
                            {helpLinks.map((link) => (
                                <li key={link}>
                                    <a
                                        href="/"
                                        onClick={(e) => e.preventDefault()}
                                    >
                                        {link}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Newsletter */}
                    <div className="fnl">
                        <h4>Stay in the Loop</h4>

                        <p>
                            Exclusive deals & style inspiration,
                            straight to your inbox.
                        </p>

                        {subscribed ? (
                            <div className="success">
                                <CheckIcon />
                                <span>Subscribed — thanks!</span>
                            </div>
                        ) : (
                            <form
                                className="ni-wrap"
                                onSubmit={handleSubmit}
                            >
                                <input
                                    type="email"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) =>
                                        setEmail(e.target.value)
                                    }
                                    aria-label="Email address"
                                />

                                <button
                                    type="submit"
                                    className="sub-btn"
                                >
                                    Subscribe
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Footer bottom section */}
                <div className="fbot">

                    <div className="fbot-l">
                        <span>
                            © 2026 Shopper Inc.
                        </span>

                        <span>&nbsp;·&nbsp;</span>

                        <a
                            href="/"
                            onClick={(e) => e.preventDefault()}
                        >
                            Privacy
                        </a>

                        <span>&nbsp;·&nbsp;</span>

                        <a
                            href="/"
                            onClick={(e) => e.preventDefault()}
                        >
                            Terms
                        </a>
                    </div>

                  

                </div>
            </div>
        </footer>
    );
}

export default Footer;