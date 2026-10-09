import { useRouter } from "expo-router";
import { Button, Label, Screen } from "@/components/ui";
import { t } from "@/localization";
export default function Unavailable() {
    const router = useRouter();
    return (
        <Screen>
            <Label>{t("unavailable")}</Label>
            <Button label={t("home")} onPress={() => router.replace("/")} />
        </Screen>
    );
}
