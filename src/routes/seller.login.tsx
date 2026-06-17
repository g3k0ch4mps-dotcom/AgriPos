import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "./owner.login";

export const Route = createFileRoute("/seller/login")({
  component: () => <LoginScreen role="seller" />,
});
