import { router } from "expo-router";
import { useBootstrap, useSession } from "@/auth/session";
import { Button, Card, Label, Row, Screen } from "@/components/ui";
import { t } from "@/localization";
import { useModules } from "@/modules/registry";
import { InboxDestination } from "@/features/inbox";
import { Brand } from "@/components/brand";
import {
    ShieldCheck,
    UserRound,
    Palette,
    Bell,
    ChartNoAxesColumn,
    KeyRound,
    Smartphone,
    Settings,
    ChevronRight,
    Users,
} from "lucide-react-native";
import { View } from "react-native";
import { useTheme } from "@/theme";
export default function More() {
    const snapshot = useBootstrap();
    const session = useSession();
    const destinations = useModules("more");
    const { colors } = useTheme();
    const icons = {
        profile: UserRound,
        preferences: Palette,
        notifications: Bell,
        reports: ChartNoAxesColumn,
        keys: KeyRound,
        sessions: Smartphone,
        settings: Settings,
        roles: ShieldCheck,
        users: Users,
    };
    return (
        <Screen scroll>
            <Brand />
            <Label size="h1">{t("more")}</Label>
            <Card>
                <Label size="title">{snapshot.account.name}</Label>
                <Label tone="secondary">{snapshot.account.email}</Label>
            </Card>
            <Card>
                {destinations.map((item) =>
                    item.id === "notifications" ? (
                        <InboxDestination key={item.id} />
                    ) : (
                        <Row
                            key={item.id}
                            title={t(item.label)}
                            leading={
                                <View
                                    style={{
                                        width: 36,
                                        height: 36,
                                        borderRadius: 12,
                                        backgroundColor:
                                            colors.brand.primarySoft,
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    {(() => {
                                        const Icon =
                                            icons[
                                                item.id as keyof typeof icons
                                            ] ?? Settings;
                                        return (
                                            <Icon
                                                size={20}
                                                color={colors.brand.primary}
                                            />
                                        );
                                    })()}
                                </View>
                            }
                            trailing={
                                <ChevronRight
                                    size={18}
                                    color={colors.text.tertiary}
                                />
                            }
                            onPress={() => router.push(item.route)}
                        />
                    ),
                )}
            </Card>
            <Button
                variant="secondary"
                label={t("logout")}
                onPress={() => void session.logout()}
            />
        </Screen>
    );
}
