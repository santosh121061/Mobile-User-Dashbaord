import { Redirect } from "expo-router";
import { useSession } from "@/auth/session";
export default function Index() {
    const { phase } = useSession();
    return (
        <Redirect
            href={phase === "ready" ? "/(app)/(tabs)" : "/(auth)/login"}
        />
    );
}
