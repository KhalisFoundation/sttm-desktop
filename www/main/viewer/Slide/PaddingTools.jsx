import PropTypes from 'prop-types';
import React from 'react';

const PaddingTools = (props) => {
    const [paddingToolsOpen, setPaddingToolsOpen] = useState(false);
    return (
        <div className={`slide-quicktools ${!userSettings.quickTools ? 'hide-quicktools' : ''}`.trim()}>
            <div className="quicktool-header" onClick={() => setPaddingToolsOpen(!paddingToolsOpen)}>
                Padding Tools
                <i className={`fa fa-caret-${quickToolsOpen ? 'up' : 'down'}`}></i>
            </div>
            {paddingToolsOpen && (
                <div className={`quicktool-body quicktool-${isMiscSlide ? 'announcement' : 'gurbani'}`}>
                {baniOrder.map((order, index) => (
                    <div key={`item-${index}`} className="quicktool-item">
                    {handleQuickTools(order, index)}
                    <div className="quicktool-icons">{bakeIcons(order, index, quickToolsModifiers)}</div>
                    </div>
                ))}
                </div>
            )}
        </div>
    )   
}

PaddingTools.propTypes = {
    isMiscSlide: PropTypes.bool
}

export default PaddingTools;