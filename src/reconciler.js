import {
    isEventProp,
    isProperty,
    isNewProp,
    isGoneProp,
    isFunctionComponent
} from './utils'

export function render(element, container) {
    wipRoot = {
        dom: container,
        props: {
            children: [ element ]
        },
        alternate: currentRoot
    }
    deletions = []
    nextUnitOfWork = wipRoot
}

function createDom(fiber) {
    const dom = fiber.type === 'TEXT_ELEMENT'
        ? document.createTextNode('')
        : document.createElement(fiber.type)
    
    updateDom( dom, {}, fiber.props )

    return dom
}

let nextUnitOfWork = null // each unit of work is a fiber for a element.
let wipRoot = null
let currentRoot = null
let deletions = null // store nodes needed be removed.
let wipFiber = null
let hookIndex = null
let shouldYield = false

function workLoop(dealine) {
    while (nextUnitOfWork && !shouldYield) { // workloop could be yield.
        nextUnitOfWork = performUnitOfWork( nextUnitOfWork )

        shouldYield = dealine.timeRemaining() < 1
    }

    if (!nextUnitOfWork && wipRoot) {
        commitRoot()
    }

    requestIdleCallback( workLoop )
}

// commit fiber tree to the dom.
function commitRoot() {
    deletions.forEach( commitWork )
    commitWork(wipRoot.child)
    currentRoot = wipRoot
    wipRoot = null
}

function commitWork(fiber) {
    if (!fiber) return
    let parentFiber = fiber.parent 
    while (!parentFiber.dom) { // exclude function component
        parentFiber = parentFiber.parent
    }
    const parentDom = parentFiber.dom

    if (fiber.effectTag === 'PLACEMENT' &&
        fiber.dom !== null
    ) {
        parentDom.appendChild( fiber.dom )
    }
    if (fiber.effectTag === 'DELETE') {
        commitDeletion( fiber, parentDom )
        return
    }
    if (fiber.effectTag === 'UPDATE') {
        updateDom(
            fiber.dom,
            fiber.alternate.props,
            fiber.props
        )
    }

    commitWork( fiber.child )
    commitWork( fiber.sibling )
}

function commitDeletion(fiber, parentDom) {
    if (fiber.dom) { // exclude function component
        parentDom.removeChild( fiber.dom )
    } else {
        commitDeletion(fiber.child, parentDom)
    }
}

function updateDom(dom, oldProps, newProps) {
    // remove old props
    Object.keys(oldProps)
        .filter(isProperty)
        .filter(isGoneProp(oldProps, newProps))
        .forEach(key => {
            dom[ key ] = ''
        })

    // set new or changed props
    Object.keys(newProps)
        .filter(isProperty)
        .filter(isNewProp(oldProps, newProps))
        .forEach(key => {
            dom[ key ] = newProps[ key ]
        })
    
    // remove old event props.
    Object.keys(oldProps)
        .filter(isEventProp)
        .filter(k => 
            isNewProp(oldProps, newProps)(k) || 
            isGoneProp(oldProps, newProps)(k)
        )
        .forEach(key => {
            const eventType = key.toLowerCase().slice(2)
            dom.removeEventListener(eventType, oldProps[ key ])
        })

    // set new event props
    Object.keys(newProps)
        .filter(isEventProp)
        .filter(isNewProp(oldProps, newProps))
        .forEach(key => {
            const eventType = key.toLowerCase().slice(2)
            dom.addEventListener(eventType, newProps[ key ])
        })
}

function performUnitOfWork(fiber) {
    if ( isFunctionComponent(fiber.type) ) {
        updateFunctionComponent( fiber )
    } else {
        updateHostComponent( fiber )
    }

    // return next unit of work
    if (fiber.child) {
        return fiber.child
    }
    let nextFiber = fiber
    while (nextFiber) {
        if (nextFiber.sibling) {
            return nextFiber.sibling
        }
        nextFiber = nextFiber.parent
    }
}

function updateFunctionComponent(fiber) {
    wipFiber = fiber
    hookIndex = 0
    wipFiber.hooks = []

    const children = [ fiber.type(fiber.props) ]
    reconcileChildren(fiber, children)
}

function updateHostComponent(fiber) {
    // set dom property
    if (!fiber.dom) {
        fiber.dom = createDom(fiber)
    }

    const elements = fiber.props.children
    reconcileChildren(fiber, elements)
}

// reconciler children
function reconcileChildren(wipFiber, elements) {
    let index = 0
    let prevSibling = null
    let oldFiber = wipFiber.alternate && wipFiber.alternate.child

    while (index < elements.length || oldFiber != null) {
        let newFiber = null
        const element = elements[ index ]
        const sameType = oldFiber &&
            element &&
            oldFiber.type === element.type

        if (sameType) {
            // update
            newFiber = {
                type: oldFiber.type,
                props: element.props,
                dom: oldFiber.dom,
                parent: wipFiber,
                alternate: oldFiber,
                effectTag: 'UPDATE'
            }
        }
        if (element && !sameType) {
            // add element
            newFiber = {
                type: element.type,
                props: element.props,
                dom: null,
                parent: wipFiber,
                alternate: null,
                effectTag: 'PLACEMENT'
            }
        }
        if (oldFiber && !sameType) {
            // delete old fiber
            oldFiber.effectTag = 'DELETE'
            deletions.push(oldFiber)
        }

        if (oldFiber) {
            oldFiber = oldFiber.sibling
        }

        if (index === 0) {
            wipFiber.child = newFiber
        } else if (element) {
            prevSibling.sibling = newFiber
        }

        prevSibling = newFiber
        index++
    }
}

export function useState( initial ) {
    const oldHook = 
        wipFiber.alternate &&
        wipFiber.alternate.hooks &&
        wipFiber.alternate.hooks[ hookIndex ]
    
    const hook = {
        state: oldHook ? oldHook.state : initial,
        queue: []
    }

    const actions = oldHook ? oldHook.queue : []
    actions.forEach(action => {
        hook.state = action( hook.state )
    })

    const setState = action => {
        hook.queue.push( action )
        
        wipRoot = {
            dom: currentRoot.dom,
            props: currentRoot.props,
            alternate: currentRoot
        }
        nextUnitOfWork = wipRoot
        deletions = []
    }

    wipFiber.hooks.push( hook )
    hookIndex++

    return [ hook.state, setState ]
}

requestIdleCallback( workLoop ) // TODO: when to stop.