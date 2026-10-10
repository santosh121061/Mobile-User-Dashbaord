import React from "react";
import { View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button, Empty, ErrorState, Label, Loading } from "./ui";
import { t } from "@/localization";
export function Records<T extends { id: string }>({
  rows,
  render,
  pending,
  error,
  retry,
  refreshing,
  next,
  more,
  loadingMore,
  bottomPadding = 16,
}: {
  rows: T[];
  render: (row: T) => React.ReactElement;
  pending: boolean;
  error: unknown;
  retry: () => void;
  refreshing?: boolean;
  next?: () => void;
  more?: boolean;
  loadingMore?: boolean;
  bottomPadding?: number;
}) {
  if (pending) return <Loading />;
  if (error && !rows.length) return <ErrorState error={error} retry={retry} />;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "transparent",
        minHeight: 0,
      }}
    >
      <FlashList
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        data={rows}
        keyExtractor={(row) => row.id}
        renderItem={({ item }) => render(item)}
        keyboardShouldPersistTaps="handled"
        refreshing={!!refreshing}
        onRefresh={retry}
        onEndReached={() => {
          if (more && !loadingMore) next?.();
        }}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={<Empty />}
        ListFooterComponent={
          <View style={{ padding: 16, gap: 8 }}>
            {error ? (
              <ErrorState error={error} retry={retry} />
            ) : loadingMore ? (
              <Loading />
            ) : more ? (
              <Button
                label={t("loadingMore")}
                variant="secondary"
                onPress={() => next?.()}
              />
            ) : rows.length ? (
              <Label size="caption" tone="secondary">
                {t("end")}
              </Label>
            ) : null}
          </View>
        }
      />
    </View>
  );
}
