import "./RequestTable.css";
import cx from "classnames";
import { useContext, useEffect, useRef } from "react";
import { Button, Checkbox, Input, InputRef, Popover } from "antd";
import { ClearOutlined, SettingOutlined } from "@ant-design/icons";
import { AppContext } from "./AppContext.tsx";
import { METHOD_CATEGORIES } from "../types/main.ts";
import {
  MethodCategoryChip,
  RpcRequestFilter,
  selectMethodCategory,
} from "../table/rpcRequestFilter.ts";
import { addPanelShortcut } from "../utils/panelShortcut.ts";

const CHIPS: readonly MethodCategoryChip[] = ["All", ...METHOD_CATEGORIES];

interface RequestToolbarProps {
  filter: RpcRequestFilter;
  onFilterChange: (filter: RpcRequestFilter) => void;
  onClear: () => void;
}

// Modelled on the filter bar of the DevTools Network tab
export const RequestToolbar = ({
  filter,
  onFilterChange,
  onClear,
}: RequestToolbarProps) => {
  const isPressed = (chip: MethodCategoryChip) =>
    chip === "All"
      ? filter.methodCategories.length === 0
      : filter.methodCategories.includes(chip);

  const searchRef = useRef<InputRef>(null);

  // Ctrl/⌘+F jumps to the search box from anywhere in the Panel, instead of
  // opening the DevTools search
  useEffect(
    () =>
      addPanelShortcut((event) => {
        if (
          !(event.ctrlKey || event.metaKey) ||
          event.altKey ||
          event.shiftKey ||
          // By key position, so it works on non-Latin layouts too
          event.code !== "KeyF"
        ) {
          return false;
        }
        searchRef.current?.focus({ cursor: "all" });
        return true;
      }),
    [],
  );

  return (
    <div className="rpc-table-toolbar">
      <Button
        size="small"
        type="text"
        title="Clear"
        icon={<ClearOutlined />}
        onClick={onClear}
      />
      <Input
        size="small"
        allowClear
        className="rpc-table-search"
        placeholder="Filter"
        aria-label="Filter"
        ref={searchRef}
        value={filter.search}
        onChange={(event) =>
          onFilterChange({ ...filter, search: event.target.value })
        }
        onKeyDown={(event) => {
          // An empty box lets Esc through to DevTools
          if (event.key === "Escape" && filter.search !== "") {
            event.preventDefault();
            onFilterChange({ ...filter, search: "" });
          }
        }}
      />
      <div
        className="rpc-table-chips"
        role="group"
        aria-label="Method Category"
      >
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            className={cx("rpc-table-chip", {
              "rpc-table-chip-pressed": isPressed(chip),
            })}
            aria-pressed={isPressed(chip)}
            title={chip === "All" ? undefined : "Ctrl/⌘+click to add or remove"}
            onClick={(event) =>
              onFilterChange({
                ...filter,
                methodCategories: selectMethodCategory(
                  filter.methodCategories,
                  chip,
                  event.ctrlKey || event.metaKey,
                ),
              })
            }
          >
            {chip}
          </button>
        ))}
      </div>
      <Checkbox
        className="rpc-table-errors"
        checked={filter.errorsOnly}
        onChange={(event) =>
          onFilterChange({ ...filter, errorsOnly: event.target.checked })
        }
      >
        Errors
      </Checkbox>
      <SettingsButton />
    </div>
  );
};

const SettingsButton = () => {
  const { settings, updateSettings } = useContext(AppContext);

  return (
    <Popover
      trigger="click"
      placement="bottomRight"
      content={
        <div className="rpc-table-settings">
          <Checkbox
            checked={settings.fetchAbisAutomatically}
            onChange={(event) =>
              updateSettings({ fetchAbisAutomatically: event.target.checked })
            }
          >
            Fetch ABIs automatically
          </Checkbox>
          <label className="rpc-table-settings-field">
            Etherscan API key
            {/* Masked; saved as typed, used from the next fetch on */}
            <Input.Password
              size="small"
              placeholder="Optional"
              autoComplete="off"
              spellCheck={false}
              value={settings.etherscanApiKey}
              onChange={(event) =>
                updateSettings({ etherscanApiKey: event.target.value })
              }
            />
          </label>
          <div className="rpc-table-settings-note">
            Addresses of called contracts and the chain id are sent to Sourcify
            and, with a key, to Etherscan.
          </div>
        </div>
      }
    >
      <Button
        size="small"
        type="text"
        className="rpc-table-settings-button"
        title="Settings"
        aria-label="Settings"
        icon={<SettingOutlined />}
      />
    </Popover>
  );
};
