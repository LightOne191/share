import React from 'react';
import {ReactKeycloakProvider, useKeycloak} from "@react-keycloak/web";
import {
    Container,
    CssBaseline,
    Dialog,
    DialogContent,
    DialogContentText,
    DialogTitle,
} from "@mui/material";

import makeStyles from '@mui/styles/makeStyles';

import keycloak from "./keycloak";
import "@fontsource/roboto"
import './App.css';
import ShareList from "./components/ShareList";
import {BrowserRouter, Route, Switch} from "react-router-dom";
import AddShare from "./components/AddShare";
import DropFile from "./components/DropFile";
import {LocalizationProvider} from "@mui/lab";
import DateAdapter from '@mui/lab/AdapterMoment';


const useStyles = makeStyles({
    container: {
        marginTop: '4em',
        marginBottom: '4em',
    }
});

function AuthorizationBarrier(props) {
    const {keycloak} = useKeycloak();

    const isAuthorized = keycloak.tokenParsed?.roles?.includes('member');

    if(isAuthorized) {
        return (
            props.children
        );
    }
    else {
        return (
            <Dialog open={true}>
                <DialogTitle>Unauthorized</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You dont have the permission to use this service.
                    </DialogContentText>
                </DialogContent>
            </Dialog>
        );
    }
}

function App() {

  const classes = useStyles();

  return (
      <ReactKeycloakProvider authClient={keycloak} LoadingComponent={<React.Fragment />} initOptions={{
        onLoad: 'login-required',
        promiseType: 'native',
        flow: 'standard',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      }}>
          <LocalizationProvider dateAdapter={DateAdapter}>
            <CssBaseline />
            <AuthorizationBarrier>
                <BrowserRouter>
                    <DropFile>
                        <Container className={classes.container} maxWidth={"sm"}>
                          <Switch>
                            <Route path={'/'} exact>
                              <ShareList />
                            </Route>
                            <Route path={'/add'} exact>
                              <AddShare />
                            </Route>
                          </Switch>
                        </Container>
                    </DropFile>
                </BrowserRouter>
            </AuthorizationBarrier>
          </LocalizationProvider>
      </ReactKeycloakProvider>
  );
}

export default App;
