import React, { forwardRef, useEffect, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    TextInput,
    View,
    type TextInputProps,
    type TextProps,
    type ViewStyle,
    useWindowDimensions,
} from "react-native";
import { useTheme, tokens } from "@/theme";
import { t, type StringKey } from "@/localization";
import { ApiError } from "@/api/client";
import { File } from "lucide-react-native";
export function Label({
    children,
    tone = "primary",
    size = "body",
    style,
    ...props
}: TextProps & {
    tone?: "primary" | "secondary" | "tertiary";
    size?: keyof typeof tokens.typography.scale;
}) {
    const { colors } = useTheme();
    const typography = tokens.typography.scale[size];
    return (
        <Text
            {...props}
            style={[
                {
                    color: colors.text[tone],
                    fontSize: typography.fontSize,
                    lineHeight: typography.lineHeight,
                    fontFamily:
                        typography.fontWeight === "600"
                            ? "Inter_600SemiBold"
                            : typography.fontWeight === "500"
                              ? "Inter_500Medium"
                              : "Inter_400Regular",
                },
                style,
            ]}
        >
            {children}
        </Text>
    );
}
export function Screen({
    children,
    scroll = false,
    style,
    refreshing = false,
    onRefresh,
    contentStyle,
}: React.PropsWithChildren<{
    scroll?: boolean;
    style?: ViewStyle;
    refreshing?: boolean;
    onRefresh?: () => void;
    contentStyle?: ViewStyle;
}>) {
    const { colors } = useTheme();
    const { width } = useWindowDimensions();
    const content = {
        paddingHorizontal: width < 768 ? 16 : 24,
        paddingTop: 16,
        paddingBottom: 24,
        gap: 16,
        ...contentStyle,
    } satisfies ViewStyle;
    return (
        <KeyboardAvoidingView
            style={[{ flex: 1, backgroundColor: colors.canvas }, style]}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
            {scroll ? (
                <ScrollView
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={content}
                    refreshControl={
                        onRefresh ? (
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor={colors.brand.primary}
                                colors={[colors.brand.primary]}
                                progressBackgroundColor={colors.surface}
                            />
                        ) : undefined
                    }
                >
                    {children}
                </ScrollView>
            ) : (
                <View style={[content, { flex: 1 }]}>{children}</View>
            )}
        </KeyboardAvoidingView>
    );
}
export function Card({
    children,
    style,
}: React.PropsWithChildren<{ style?: ViewStyle }>) {
    const { colors } = useTheme();
    return (
        <View
            style={[
                {
                    backgroundColor: colors.surface,
                    padding: 16,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    gap: 12,
                    ...tokens.shadows.elevation1,
                },
                style,
            ]}
        >
            {children}
        </View>
    );
}
export function Button({
    label,
    onPress,
    disabled,
    loading,
    variant = "primary",
    testID,
}: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
    loading?: boolean;
    variant?: "primary" | "secondary" | "danger" | "tertiary";
    testID?: string;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{
                disabled: disabled || loading,
                busy: loading,
            }}
            onPress={onPress}
            disabled={disabled || loading}
            style={({ pressed }) => ({
                minHeight: 48,
                minWidth: 48,
                paddingVertical: 12,
                paddingHorizontal: 16,
                borderRadius: 12,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: disabled
                    ? colors.surfaceMuted
                    : variant === "tertiary"
                      ? "transparent"
                      : variant === "secondary"
                        ? colors.surface
                        : variant === "danger"
                          ? pressed
                              ? colors.status.dangerPressed
                              : colors.status.danger
                          : pressed
                            ? colors.brand.primaryPressed
                            : colors.brand.primary,
                borderWidth: variant === "secondary" ? 1 : 0,
                borderColor: colors.brand.primary,
            })}
        >
            {({ pressed }) => {
                const foreground = disabled
                    ? colors.text.tertiary
                    : variant === "secondary" || variant === "tertiary"
                      ? colors.brand.primary
                      : variant === "danger"
                        ? pressed
                            ? colors.status.dangerPressedText
                            : colors.status.dangerButtonText
                        : pressed
                          ? colors.brand.primaryPressedText
                          : colors.brand.primaryText;
                return loading ? (
                    <ActivityIndicator color={foreground} />
                ) : (
                    <Label
                        size="button"
                        style={{
                            color: foreground,
                        }}
                    >
                        {label}
                    </Label>
                );
            }}
        </Pressable>
    );
}
export const Input = forwardRef<
    TextInput,
    TextInputProps & {
        label: string;
        error?: string;
        help?: string;
        leading?: React.ReactNode;
        trailing?: React.ReactNode;
        hideLabel?: boolean;
    }
>(function Input(
    { label, error, help, style, leading, trailing, hideLabel, ...props },
    ref,
) {
    const { colors } = useTheme();
    const [focused, setFocused] = useState(false);
    return (
        <View style={{ gap: 4 }}>
            {!hideLabel && <Label size="captionMedium">{label}</Label>}
            <View
                style={{
                    flexDirection: "row",
                    alignItems: "center",
                    minHeight: 48,
                    borderRadius: 12,
                    borderWidth: focused ? 2 : 1,
                    borderColor: error
                        ? colors.status.danger
                        : focused
                          ? colors.focus
                          : colors.controlBorder,
                    backgroundColor: colors.surface,
                    paddingStart: leading ? 12 : 0,
                    overflow: "hidden",
                }}
            >
                {leading}
                <TextInput
                    ref={ref}
                    accessibilityLabel={label}
                    placeholderTextColor={colors.text.tertiary}
                    {...props}
                    onFocus={(event) => {
                        setFocused(true);
                        props.onFocus?.(event);
                    }}
                    onBlur={(event) => {
                        setFocused(false);
                        props.onBlur?.(event);
                    }}
                    style={[
                        {
                            minHeight: focused ? 44 : 46,
                            flex: 1,
                            minWidth: 0,
                            color: colors.text.primary,
                            backgroundColor: colors.surface,
                            paddingHorizontal: 12,
                            paddingVertical: 12,
                            fontFamily: "Inter_400Regular",
                            fontSize: 14,
                        },
                        style,
                    ]}
                />
                {trailing}
            </View>
            {!!error && (
                <Label
                    accessibilityLiveRegion="polite"
                    style={{ color: colors.status.dangerText }}
                    size="caption"
                >
                    {error}
                </Label>
            )}
            {!!help && (
                <Label size="caption" tone="secondary">
                    {help}
                </Label>
            )}
        </View>
    );
});
export function Chip({
    label,
    selected,
    onPress,
}: {
    label: string;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={onPress}
            style={{
                minHeight: 48,
                minWidth: 48,
                justifyContent: "center",
                paddingHorizontal: 4,
            }}
        >
            <View
                style={{
                    minHeight: 32,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 9999,
                    backgroundColor: selected
                        ? colors.brand.primarySoft
                        : colors.surfaceMuted,
                }}
            >
                <Label
                    size="captionMedium"
                    style={{
                        color: selected
                            ? colors.brand.primary
                            : colors.text.secondary,
                    }}
                >
                    {selected ? "✓ " : ""}
                    {label}
                </Label>
            </View>
        </Pressable>
    );
}
export function Row({
    title,
    subtitle,
    accessibilityLabel,
    trailing,
    onPress,
    onLongPress,
    selected,
    leading,
    metadata,
    status,
}: {
    title: string;
    subtitle?: string;
    accessibilityLabel?: string;
    trailing?: React.ReactNode;
    onPress?: () => void;
    onLongPress?: () => void;
    selected?: boolean;
    leading?: React.ReactNode;
    metadata?: string;
    status?: "enabled" | "disabled" | "archived";
}) {
    const { colors } = useTheme();
    return (
        <View
            style={{
                minHeight: 64,
                paddingHorizontal: 12,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.divider,
                backgroundColor: selected
                    ? colors.brand.primarySoft
                    : colors.surface,
            }}
        >
            <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                accessibilityRole={onPress ? "button" : undefined}
                accessibilityLabel={
                    accessibilityLabel ??
                    [title, subtitle, status && t(status), metadata]
                        .filter(Boolean)
                        .join(", ")
                }
                accessibilityState={{ selected }}
                style={{
                    minHeight: 64,
                    paddingVertical: 12,
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    backgroundColor: selected
                        ? colors.brand.primarySoft
                        : colors.surface,
                }}
            >
                {leading ?? (
                    <View
                        style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.brand.primarySoft,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Label
                            size="bodyMedium"
                            style={{ color: colors.brand.primary }}
                        >
                            {title
                                .split(" ")
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part.charAt(0))
                                .join("")}
                        </Label>
                    </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                    <Label size="bodyMedium">{title}</Label>
                    <View
                        style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        {!!subtitle && (
                            <Label size="caption" tone="secondary">
                                {subtitle}
                            </Label>
                        )}
                        {status && (
                            <View
                                style={{
                                    flexDirection: "row",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                <View
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor:
                                            status === "enabled"
                                                ? colors.status.successText
                                                : status === "archived"
                                                  ? colors.status.warningText
                                                  : colors.text.secondary,
                                    }}
                                />
                                <Label
                                    size="caption"
                                    style={{
                                        color:
                                            status === "enabled"
                                                ? colors.status.successText
                                                : status === "archived"
                                                  ? colors.status.warningText
                                                  : colors.text.secondary,
                                    }}
                                >
                                    {t(status)}
                                </Label>
                            </View>
                        )}
                    </View>
                </View>
                {!!metadata && (
                    <Label
                        size="caption"
                        tone="secondary"
                        style={{ maxWidth: 96, textAlign: "right" }}
                    >
                        {metadata}
                    </Label>
                )}
            </Pressable>
            {trailing}
        </View>
    );
}
export function Loading() {
    const { colors } = useTheme();
    return (
        <View
            accessibilityLabel={t("loading")}
            style={{ gap: 16, padding: 16 }}
        >
            {[0, 1, 2].map((key) => (
                <View
                    key={key}
                    style={{
                        height: 64,
                        borderRadius: 16,
                        backgroundColor: colors.surfaceMuted,
                    }}
                />
            ))}
        </View>
    );
}
export function ErrorState({
    error,
    retry,
}: {
    error: unknown;
    retry?: () => void;
}) {
    if (error instanceof ApiError && error.status === 409)
        return <ConflictState refresh={retry} requestId={error.requestId} />;
    if (error instanceof ApiError && error.status === 503)
        return (
            <MaintenanceState
                retry={retry}
                requestId={error.requestId}
                retryAfter={error.retryAfter}
                retryAt={error.retryAt}
            />
        );
    let title: StringKey = "connection",
        hint: StringKey = "connectionHint";
    if (error instanceof ApiError) {
        if (error.status === 426 && error.code === "MOBILE_UPDATE_REQUIRED") {
            title = "updateRequired";
            hint = "updateRequiredHint";
        } else if (error.status === 403 || error.status === 404) {
            title = "forbidden";
            hint = "forbiddenHint";
        } else if (error.status === 429) {
            title = "rateLimit";
            hint = "rateLimit";
        } else if (error.status === 422) {
            title = "validation";
            hint = "validation";
        } else if (error.status === 410) {
            title = "exportExpired";
            hint = "exportExpired";
        } else if (error.status >= 500) {
            title = "serverError";
            hint = "serverError";
        }
    }
    return (
        <Card>
            <Label accessibilityRole="header" size="title">
                {t(title)}
            </Label>
            <Label tone="secondary">{t(hint)}</Label>
            {error instanceof ApiError && error.requestId && (
                <Label size="caption">
                    {t("supportId")}: {error.requestId}
                </Label>
            )}
            {retry && (
                <RetryButton
                    key={
                        error instanceof ApiError
                            ? [
                                  error.status,
                                  error.requestId,
                                  error.retryAfter,
                              ].join(":")
                            : "network"
                    }
                    delay={
                        error instanceof ApiError && error.status === 429
                            ? (error.retryAfter ?? 60)
                            : 0
                    }
                    retryAt={
                        error instanceof ApiError ? error.retryAt : undefined
                    }
                    retry={retry}
                />
            )}
        </Card>
    );
}
export function ConflictState({
    refresh,
    requestId,
}: {
    refresh?: () => void;
    requestId?: string | null;
}) {
    return (
        <Card>
            <Label accessibilityRole="header" size="title">
                {t("conflict")}
            </Label>
            <Label tone="secondary">{t("conflictHint")}</Label>
            {!!requestId && (
                <Label size="caption">
                    {t("supportId")}: {requestId}
                </Label>
            )}
            {refresh && (
                <Button
                    variant="secondary"
                    label={t("refresh")}
                    onPress={refresh}
                />
            )}
        </Card>
    );
}
export function MaintenanceState({
    retry,
    requestId,
    retryAfter = 0,
    retryAt,
}: {
    retry?: () => void;
    requestId?: string | null;
    retryAfter?: number;
    retryAt?: number;
}) {
    return (
        <Card>
            <Label accessibilityRole="header" size="title">
                {t("maintenance")}
            </Label>
            <Label tone="secondary">{t("maintenanceHint")}</Label>
            {!!requestId && (
                <Label size="caption">
                    {t("supportId")}: {requestId}
                </Label>
            )}
            {retry && (
                <RetryButton
                    key={[requestId, retryAfter].join(":")}
                    delay={retryAfter}
                    retryAt={retryAt}
                    retry={retry}
                />
            )}
        </Card>
    );
}
export function AvailabilityState({
    error,
    apiDisabled = false,
    configured = true,
    retry,
    logout,
}: {
    error?: unknown;
    apiDisabled?: boolean;
    configured?: boolean;
    retry: () => void;
    logout: () => void;
}) {
    return (
        <Screen scroll>
            {configured && !apiDisabled && error !== undefined ? (
                <ErrorState error={error} retry={retry} />
            ) : (
                <Card>
                    <Label accessibilityRole="header" size="title">
                        {t(
                            !configured
                                ? "setup"
                                : apiDisabled
                                  ? "apiDisabled"
                                  : "connection",
                        )}
                    </Label>
                    <Label tone="secondary">
                        {t(!configured ? "setupHint" : "connectionHint")}
                    </Label>
                    <Button
                        variant="secondary"
                        label={t("retry")}
                        onPress={retry}
                    />
                </Card>
            )}
            <Button variant="secondary" label={t("logout")} onPress={logout} />
        </Screen>
    );
}
function RetryButton({
    delay,
    retry,
    retryAt,
}: {
    delay: number;
    retry: () => void;
    retryAt?: number;
}) {
    const [deadline] = useState(
        () => retryAt ?? Date.now() + Math.max(0, delay) * 1000,
    );
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!delay) return;
        const timer = setInterval(() => {
            const timestamp = Date.now();
            setNow(timestamp);
            if (timestamp >= deadline) clearInterval(timer);
        }, 1000);
        return () => clearInterval(timer);
    }, [delay, deadline]);
    const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
    return (
        <Button
            variant="secondary"
            label={seconds ? t("retryWait", { seconds }) : t("retry")}
            disabled={seconds > 0}
            onPress={retry}
        />
    );
}
export function Empty() {
    const { colors } = useTheme();
    return (
        <View
            style={{
                minHeight: 200,
                padding: 24,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
            }}
        >
            <File size={40} color={colors.text.secondary} />
            <Label size="title" style={{ textAlign: "center" }}>
                {t("empty")}
            </Label>
            <Label
                size="caption"
                tone="secondary"
                style={{ textAlign: "center" }}
            >
                {t("emptyHint")}
            </Label>
        </View>
    );
}
