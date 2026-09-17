import React, { useState } from "react";
import { Link } from "react-router-dom";
import "./CSS/loginsignup.css";
import logo from "../Components/Assets/logo.svg";

const LoginSignup = () => {
    const [isLogin, setIsLogin] = useState(true);

    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
    });

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const changeHandler = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });

        setError("");
    };

    // LOGIN
    const login = async () => {
        if (!formData.email || !formData.password) {
            setError("Please fill in all fields");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await fetch("http://localhost:4000/login", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                }),
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem("auth-token", data.token);
                window.location.replace("/");
            } else {
                setError(
                    data.errors || "Login failed. Please try again."
                );
            }
        } catch (err) {
            setError(
                "Login failed. Please check your connection."
            );
        } finally {
            setLoading(false);
        }
    };

    // SIGNUP
    const signup = async () => {
        if (
            !formData.username ||
            !formData.email ||
            !formData.password
        ) {
            setError("Please fill in all fields");
            return;
        }

        if (formData.password.length < 6) {
            setError("Password must be at least 6 characters");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const response = await fetch("http://localhost:4000/signup", {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: formData.username,
                    email: formData.email,
                    password: formData.password,
                }),
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem("auth-token", data.token);
                window.location.replace("/");
            } else {
                setError(
                    data.errors || "Signup failed. Please try again."
                );
            }
        } catch (err) {
            setError(
                "Signup failed. Please check your connection."
            );
        } finally {
            setLoading(false);
        }
    };

    // FORM SUBMIT
    const handleSubmit = (e) => {
        e.preventDefault();

        if (isLogin) {
            login();
        } else {
            signup();
        }
    };

    // SWITCH LOGIN / SIGNUP
    const toggleMode = () => {
        setIsLogin(!isLogin);
        setError("");

        setFormData({
            username: "",
            email: "",
            password: "",
        });
    };

    return (
        <div className="auth">

            {/* Left panel - Branding */}
            <div className="auth-left">
                <div className="auth-left-content">

                    <Link to="/" className="auth-logo" onClick={() => window.scrollTo(0, 0)}>
                        <div className="auth-logo-icon">
                            <img src={logo} alt="Shopper logo" />
                        </div>

                        <span className="auth-logo-text">
                            SHOPPER
                        </span>
                    </Link>

                    <h1 className="auth-headline">
                        Discover Your
                        <br />

                        <span className="auth-headline-accent">
                            Perfect Style
                        </span>
                    </h1>

                    <p className="auth-tagline">
                        Join thousands of fashion lovers who trust
                        Shopper for the latest trends in men's,
                        women's, and kids' fashion.
                    </p>

                    <div className="auth-features">

                        <div className="auth-feature">
                            <div className="auth-feature-icon">
                                &#10003;
                            </div>

                            <span>
                                Free shipping over $50
                            </span>
                        </div>

                        <div className="auth-feature">
                            <div className="auth-feature-icon">
                                &#10003;
                            </div>

                            <span>
                                30-day easy returns
                            </span>
                        </div>

                        <div className="auth-feature">
                            <div className="auth-feature-icon">
                                &#10003;
                            </div>

                            <span>
                                Secure checkout
                            </span>
                        </div>

                    </div>
                </div>

                <div className="auth-left-shapes">
                    <div className="auth-shape auth-shape-1"></div>
                    <div className="auth-shape auth-shape-2"></div>
                    <div className="auth-shape auth-shape-3"></div>
                </div>
            </div>

            {/* Right panel - Form */}
            <div className="auth-right">

                <div className="auth-form-wrapper">

                    <div
                        className={`auth-form-container ${isLogin
                                ? ""
                                : "auth-form-container--signup"
                            }`}
                    >

                        {/* LOGIN FORM */}
                        <div
                            className={`auth-form ${isLogin
                                    ? "auth-form--active"
                                    : ""
                                }`}
                        >
                            <div className="auth-form-header">

                                <h2>
                                    Welcome back
                                </h2>

                                <p>
                                    Sign in to continue shopping
                                </p>

                            </div>

                            <form
                                onSubmit={handleSubmit}
                                className="auth-fields"
                            >

                                <div className="auth-field">

                                    <label htmlFor="login-email">
                                        Email
                                    </label>

                                    <input
                                        id="login-email"
                                        name="email"
                                        value={formData.email}
                                        onChange={changeHandler}
                                        type="email"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                    />

                                </div>

                                <div className="auth-field">

                                    <label htmlFor="login-password">
                                        Password
                                    </label>

                                    <input
                                        id="login-password"
                                        name="password"
                                        value={formData.password}
                                        onChange={changeHandler}
                                        type="password"
                                        placeholder="Enter your password"
                                        autoComplete="current-password"
                                    />

                                </div>

                                {error && (
                                    <div className="auth-error">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="auth-submit"
                                >
                                    {loading
                                        ? "Please wait..."
                                        : "Sign In"}
                                </button>

                            </form>

                            <p className="auth-toggle">
                                Don't have an account?{" "}

                                <button
                                    type="button"
                                    onClick={toggleMode}
                                >
                                    Create account
                                </button>
                            </p>

                        </div>

                        {/* SIGNUP FORM */}
                        <div
                            className={`auth-form ${!isLogin
                                    ? "auth-form--active"
                                    : ""
                                }`}
                        >

                            <div className="auth-form-header">

                                <h2>
                                    Create account
                                </h2>

                                <p>
                                    Start your fashion journey today
                                </p>

                            </div>

                            <form
                                onSubmit={handleSubmit}
                                className="auth-fields"
                            >

                                <div className="auth-field">

                                    <label htmlFor="signup-username">
                                        Username
                                    </label>

                                    <input
                                        id="signup-username"
                                        name="username"
                                        value={formData.username}
                                        onChange={changeHandler}
                                        type="text"
                                        placeholder="Enter your username"
                                        autoComplete="username"
                                    />

                                </div>

                                <div className="auth-field">

                                    <label htmlFor="signup-email">
                                        Email
                                    </label>

                                    <input
                                        id="signup-email"
                                        name="email"
                                        value={formData.email}
                                        onChange={changeHandler}
                                        type="email"
                                        placeholder="you@example.com"
                                        autoComplete="email"
                                    />

                                </div>

                                <div className="auth-field">

                                    <label htmlFor="signup-password">
                                        Password
                                    </label>

                                    <input
                                        id="signup-password"
                                        name="password"
                                        value={formData.password}
                                        onChange={changeHandler}
                                        type="password"
                                        placeholder="Create a password"
                                        autoComplete="new-password"
                                    />

                                </div>

                                {error && (
                                    <div className="auth-error">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="auth-submit"
                                >
                                    {loading
                                        ? "Please wait..."
                                        : "Create Account"}
                                </button>

                            </form>

                            <p className="auth-toggle">
                                Already have an account?{" "}

                                <button
                                    type="button"
                                    onClick={toggleMode}
                                >
                                    Sign in
                                </button>
                            </p>

                        </div>

                    </div>

                </div>

            </div>

        </div>
    );
};

export default LoginSignup;