import { connection } from "next/server";
import AuthForm from "@/app/auth/auth-form";
import { getPublicDemoCredentials, isPublicDemoEnvironment } from "@/lib/public-demo";

export default async function LoginPage() {
  await connection();
  return (
    <AuthForm
      mode="login"
      isSharedPublicDemo={isPublicDemoEnvironment()}
      publicDemoCredentials={getPublicDemoCredentials()}
    />
  );
}
