import { View } from "react-native";
import { Users } from "lucide-react-native";
import type { z } from "zod";
import { auditSchema } from "@/api/runtime";
import { Label, Row } from "@/components/ui";
import { date, t } from "@/localization";
import { useTheme } from "@/theme";

export function ActivityRow({
    event,
    timezone,
    onPress,
}: {
    event: z.infer<typeof auditSchema>;
    timezone?: string;
    onPress: () => void;
}) {
    const { colors } = useTheme();
    const actor = event.actor.name ?? t("system");
    return (
        <Row
            title={actor}
            subtitle={`${event.action.replaceAll(".", " ").replaceAll("_", " ")} · ${event.outcome}`}
            metadata={date(event.created_at, timezone)}
            onPress={onPress}
            leading={
                <View
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: event.actor.name
                            ? colors.brand.primarySoft
                            : colors.status.successSoft,
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    {event.actor.name ? (
                        <Label
                            size="bodyMedium"
                            style={{ color: colors.brand.primary }}
                        >
                            {actor
                                .split(" ")
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join("")}
                        </Label>
                    ) : (
                        <Users size={20} color={colors.status.successText} />
                    )}
                </View>
            }
        />
    );
}
