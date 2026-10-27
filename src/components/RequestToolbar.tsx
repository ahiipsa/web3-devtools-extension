import "./RequestTable.css";
import cx from "classnames";
import { Fragment, useContext, useEffect, useRef } from "react";
import { Checkbox, Input, Popover } from "antd";
import {
  ClearIcon,
  CrossCircleFilledIcon,
  FilterIcon,
  GearIcon,
} from "./devtoolsIcons.tsx";
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

  const searchRef = useRef<HTMLInputElement>(null);

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
        searchRef.current?.focus();
        searchRef.current?.select();
        return true;
      }),
    [],
  );

  // Network's order: Clear, the field, a checkbox where Network has Invert,
  // then the type buttons with All set apart; ⚙ stays at the first line's end
  return (
    <div className="rpc-table-toolbar">
      <div className="rpc-table-toolbar-items">
        <button
          type="button"
          className="rpc-table-toolbar-button"
          title="Clear"
          aria-label="Clear"
          onClick={onClear}
        >
          <ClearIcon />
        </button>
        <div className="rpc-table-search">
          <FilterIcon className="rpc-table-search-icon" />
          <input
            className="rpc-table-search-input"
            placeholder="Filter"
            aria-label="Filter"
            spellCheck={false}
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
          {filter.search !== "" && (
            <button
              type="button"
              className="rpc-table-search-clear"
              title="Clear filter"
              aria-label="Clear filter"
              // A click leaves the focus in the box
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onFilterChange({ ...filter, search: "" });
                // The button goes with the text: keep the focus in the box
                searchRef.current?.focus();
              }}
            >
              <CrossCircleFilledIcon />
            </button>
          )}
        </div>
        <label className="rpc-table-errors">
          <input
            type="checkbox"
            checked={filter.errorsOnly}
            onChange={(event) =>
              onFilterChange({ ...filter, errorsOnly: event.target.checked })
            }
          />
          Errors
        </label>
        <div className="rpc-table-toolbar-divider" />
        <div
          className="rpc-table-chips"
          role="group"
          aria-label="Method Category"
        >
          {CHIPS.map((chip) => (
            <Fragment key={chip}>
              <button
                type="button"
                className={cx("rpc-table-chip", {
                  "rpc-table-chip-pressed": isPressed(chip),
                })}
                aria-pressed={isPressed(chip)}
                title={
                  chip === "All" ? undefined : "Ctrl/⌘+click to add or remove"
                }
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
              {chip === "All" && <div className="rpc-table-toolbar-divider" />}
            </Fragment>
          ))}
        </div>
      </div>
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
      <button
        type="button"
        className="rpc-table-toolbar-button rpc-table-settings-button"
        title="Settings"
        aria-label="Settings"
      >
        <GearIcon />
      </button>
    </Popover>
  );
};
