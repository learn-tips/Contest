import { Router } from "express";
import * as AuthHandler from "./auth.handler";
import passport from "passport";

const router = Router();

const FAILURE_REDIRECT_URL = process.env.FAILURE_REDIRECT_URL;
const successRedirectUrl =
    process.env.APP_URL || process.env.SUCCESS_REDIRECT_URL || "/";

function withAuthSuccessParam(url: string) {
    try {
        let redirectUrl = new URL(url);
        redirectUrl.searchParams.set("auth", "success");
        return redirectUrl.toString();
    } catch {
        return url;
    }
}

const SUCCESS_REDIRECT_URL = withAuthSuccessParam(successRedirectUrl);

router.get("/github", passport.authenticate("github"));
router.get(
    "/github/callback",
    passport.authenticate("github", {
        failureRedirect: FAILURE_REDIRECT_URL,
        successRedirect: SUCCESS_REDIRECT_URL,
    })
);
router.get("/google", passport.authenticate("google"));
router.get(
    "/google/callback",
    passport.authenticate("google", {
        failureRedirect: FAILURE_REDIRECT_URL,
        successRedirect: SUCCESS_REDIRECT_URL,
    })
);
router.delete("/signout", AuthHandler.signOut);

export default router;
